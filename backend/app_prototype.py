from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import random
import holidays
import pandas as pd
import numpy as np

app = Flask(__name__)
CORS(app)


def generate_dates(start, end):
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    days = []
    while start_dt <= end_dt:
        day_info = {
            "date": start_dt.strftime("%Y-%m-%d"),
            "weekday": start_dt.weekday(),
            "is_weekend": start_dt.weekday() >= 5,
        }
        days.append(day_info)
        start_dt += timedelta(days=1)
    return days


NUM_SCHEDULE_GENERATION_ATTEMPTS = 500

def generate_duty_roster(start_date_str, end_date_str, people_data, duty_per_day, allow_consecutive, extra_holidays_list):
    people = [p['name'] for p in people_data]
    unavailable = {p['name']: [d] for p in people_data for d in p.get('unavailable', [])}

    kr_holidays_local = holidays.HolidayBase()
    for d in extra_holidays_list:
        kr_holidays_local[d] = "Custom Holiday"

    date_list = generate_dates(start_date_str, end_date_str)
    schedule = []
    last_duty_map = {name: None for name in people} # 각 사람의 마지막 당직 날짜(문자열)를 저장
    duty_count = {person: {"weekday": 0, "weekend_or_holiday": 0} for person in people}

    for day in date_list:
        current_date_str = day["date"] # 변수명 명확히 (기존 'date' 대신)
        weekday = day["weekday"]
        is_weekend_or_holiday = day["is_weekend"] or (datetime.strptime(current_date_str, "%Y-%m-%d") in kr_holidays_local)
        
        current_date_obj = datetime.strptime(current_date_str, "%Y-%m-%d") # 현재 날짜 객체

        duty_today = []
        
        # 당일 당직 가능한 인원 필터링 (여기서 연속 당직 체크 수정)
        available_people_for_today = []
        for person in people:
            # 해당 날짜에 근무 불가능한 경우 제외
            if current_date_str in unavailable.get(person, []):
                continue

            # "연속 당직 불가능" 옵션이 선택된 경우 체크
            if not allow_consecutive: # allow_consecutive가 False일 때 (즉, 연속 당직 불가능일 때)
                persons_last_duty_str = last_duty_map.get(person)
                if persons_last_duty_str:
                    persons_last_duty_obj = datetime.strptime(persons_last_duty_str, "%Y-%m-%d")
                    # 현재 날짜가 마지막 당직일 바로 다음 날이면 제외
                    if current_date_obj == persons_last_duty_obj + timedelta(days=1):
                        continue
            
            available_people_for_today.append(person)

        if not available_people_for_today:
            # 당일 당직 가능한 인원이 없는 경우 (모든 사람이 연속당직이거나 휴가)
            # 이 경우, 스케줄 생성 실패 또는 다른 처리 (예: 빈칸으로 두거나 경고)
            # 현재 로직에서는 그냥 빈 duty_today로 넘어갈 수 있지만,
            # 필수 인원을 못 채우면 에러를 반환하는 것이 좋을 수 있습니다.
            # 여기서는 일단 빈 리스트로 두고, 나중에 전체 스케줄 유효성 검사에서 처리하거나,
            # 아래 할당 로직에서 사람이 부족하면 문제가 될 수 있음을 인지합니다.
            # 만약 duty_per_day > 0 인데 duty_today가 비면 문제이므로,
            # 여기서도 `return None` 처리를 고려할 수 있습니다.
            # (특히, 만약 available_people_for_today가 duty_per_day보다 적으면 문제)
            if duty_per_day > 0 and len(available_people_for_today) < duty_per_day:
                # print(f"Warning: Not enough available people for {current_date_str}. Needed: {duty_per_day}, Available: {len(available_people_for_today)}")
                # 이 부분은 요구사항에 따라 어떻게 처리할지 결정해야 합니다. (예: 에러 반환 또는 그냥 진행)
                # 여기서는 일단 진행하되, 실제 할당은 가능한 만큼만 됩니다.
                pass # 그냥 진행하도록 두면 아래 로직에서 가능한 만큼만 할당


        # 실제 당직자 배정 로직 (랜덤성 추가)
        # 매일 당직자 배정 전에 available_people_for_today를 기준으로 작업할 복사본 생성
        candidates_for_today = list(available_people_for_today)
        duty_today = [] # duty_today를 여기서 초기화해야 매일 새로 시작

        for _ in range(duty_per_day):
            if not candidates_for_today:
                break # 더 이상 선택할 후보가 없으면 중단

            # 후보들을 공정성 기준으로 정렬 (주말/공휴일 우선, 그 다음 총 횟수)
            # 이 정렬은 매번 선택할 때마다 다시 하는 것이 아니라,
            # duty_count는 이전까지의 누적을 사용합니다.
            candidates_for_today.sort(key=lambda p: (
                duty_count[p]["weekday"] + duty_count[p]["weekend_or_holiday"],  # 1순위: 총 당직 횟수
                duty_count[p]["weekend_or_holiday"]
            ))
            
            # 가장 공정한 점수를 가진 후보들 찾기
            if not candidates_for_today: # 혹시 모르니 한번 더 체크
                break

            best_score = (
               duty_count[candidates_for_today[0]]["weekday"] + duty_count[candidates_for_today[0]]["weekend_or_holiday"], # 총 당직
               duty_count[candidates_for_today[0]]["weekend_or_holiday"]    
            )
            
            top_tier_candidates = []
            for cand_person in candidates_for_today:
                current_person_score = (
                   duty_count[cand_person]["weekday"] + duty_count[cand_person]["weekend_or_holiday"], # 총 당직
                   duty_count[cand_person]["weekend_or_holiday"]   
                )
                if current_person_score == best_score:
                    top_tier_candidates.append(cand_person)
                else:
                    # 정렬되어 있으므로, 점수가 달라지면 그 뒤는 볼 필요 없음
                    break
            
            if not top_tier_candidates:
                # 이 경우는 발생하면 안되지만, 방어적으로 코딩
                break 

            # 가장 공정한 후보들 중에서 랜덤으로 1명 선택
            chosen_person = random.choice(top_tier_candidates)
            
            duty_today.append(chosen_person)
            last_duty_map[chosen_person] = current_date_str # 마지막 당직일 업데이트 (수정된 변수명 사용)
            
            # 당직 횟수 업데이트
            if is_weekend_or_holiday:
                duty_count[chosen_person]["weekend_or_holiday"] += 1
            else:
                duty_count[chosen_person]["weekday"] += 1
                
            # 오늘 이미 선택된 사람은 후보에서 제외
            candidates_for_today.remove(chosen_person)

        # duty_today 리스트에는 선택된 당직자들이 들어있음
        # (만약 available_people_for_today가 duty_per_day보다 적었다면, duty_today에는 가능한 만큼만 들어있을 것임)

        if duty_per_day > 0 and len(duty_today) < duty_per_day:
            # print(f"Attempt failed: Not enough people for {current_date_str}. Needed {duty_per_day}, got {len(duty_today)}") # 디버깅용
            return None  # 현재 시도 실패 -> 재시도 유도
        
        schedule.append({
            "date": current_date_str,  # 기존 'date' 대신 'current_date_str' 사용 또는 day["date"]
            "weekday": ["월", "화", "수", "목", "금", "토", "일"][weekday],
            "duty": ", ".join(sorted(duty_today)) # 당직자 이름도 정렬해서 보여주면 좋음 (이전 요청 반영)
        })        

    summary_data = []
    for person in people:
        summary_data.append({
            "person": person,
            "weekdayDuties": duty_count[person]["weekday"],
            "weekendOrHolidayDuties": duty_count[person]["weekend_or_holiday"]
        })
    return {"dutyRoster": schedule, "summary": summary_data}

def calculate_fairness_score(summary_data):
    if not summary_data:
        return float('inf') # 요약 데이터 없으면 최악의 점수

    num_people = len(summary_data)
    if num_people == 0:
        return float('inf')

    weekday_counts = [item['weekdayDuties'] for item in summary_data]
    weekend_counts = [item['weekendOrHolidayDuties'] for item in summary_data]
    total_counts = [item['weekdayDuties'] + item['weekendOrHolidayDuties'] for item in summary_data]

    # numpy.var를 사용하여 분산 계산 (모집단 분산)
    var_weekday = np.var(weekday_counts) if num_people > 0 else 0
    var_weekend = np.var(weekend_counts) if num_people > 0 else 0
    var_total = np.var(total_counts) if num_people > 0 else 0
    
    # 세 가지 분산의 합을 최종 점수로 사용 (가중치 없이 단순 합)
    # 필요하다면 특정 분산에 가중치를 줄 수 있습니다. 
    # 예: score = var_weekday + (var_weekend * 1.5) + var_total
    score = var_weekday + var_weekend  + var_total
    return score


@app.route('/api/schedule', methods=['POST'])
def create_schedule():
    data = request.get_json()
    start_date = data.get('startDate')
    end_date = data.get('endDate')
    people_data_input = data.get('people', [])
    no_consecutive_frontend = data.get('noConsecutive', True)
    duty_per_day = data.get('dutyPerDay', 1)
    extra_holidays_list_input = data.get('extraHolidays', [])

    if not start_date or not end_date or not people_data_input or duty_per_day < 0:
        return jsonify({"error": "필수 정보가 부족합니다. 시작일, 종료일, 인원 목록을 확인해주세요."}), 400

    if duty_per_day == 0:
        # (이전 답변의 duty_per_day == 0 처리 로직은 그대로 유지)
        date_list_for_empty = generate_dates(start_date, end_date)
        empty_schedule_roster = []
        for day_item in date_list_for_empty:
            empty_schedule_roster.append({
                "date": day_item["date"],
                "weekday": ["월", "화", "수", "목", "금", "토", "일"][day_item["weekday"]],
                "duty": ""
            })
        summary_for_empty = [{
            "person": p_data['name'],
            "weekdayDuties": 0,
            "weekendOrHolidayDuties": 0
        } for p_data in people_data_input]
        return jsonify({"dutyRoster": empty_schedule_roster, "summary": summary_for_empty})

    allow_consecutive_backend = not no_consecutive_frontend

    best_schedule_result = None
    best_score = float('inf') # 가장 좋은(낮은) 점수를 저장할 변수

    for attempt_num in range(NUM_SCHEDULE_GENERATION_ATTEMPTS):
        # print(f"전체 스케줄 생성 시도: {attempt_num + 1}/{NUM_SCHEDULE_GENERATION_ATTEMPTS}") # 디버깅용 로그
        
        current_generated_data = generate_duty_roster(
            start_date,
            end_date,
            list(people_data_input), # 각 시도마다 원본 데이터의 복사본 사용
            duty_per_day,
            allow_consecutive_backend,
            list(extra_holidays_list_input) # 복사본 사용
        )

        if current_generated_data is not None:
            # 성공적으로 완전한 스케줄이 생성된 경우
            summary = current_generated_data.get("summary")
            if summary:
                current_score = calculate_fairness_score(summary)
                # print(f"시도 {attempt_num + 1} 점수: {current_score}") # 디버깅용 로그
                if current_score < best_score:
                    best_score = current_score
                    best_schedule_result = current_generated_data
    
    if best_schedule_result is not None:
        # print(f"최종 선택된 스케줄 점수: {best_score}") # 디버깅용 로그
        return jsonify(best_schedule_result)
    else:
        # NUM_SCHEDULE_GENERATION_ATTEMPTS 만큼 시도했지만, 단 하나의 완전한 스케줄도 만들지 못한 경우
        return jsonify({"error": f"스케줄 생성 실패! {NUM_SCHEDULE_GENERATION_ATTEMPTS}회 다른 조합으로 시도했으나, 모든 날짜의 당직 인원을 만족시키는 배정이 불가능했습니다."}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)