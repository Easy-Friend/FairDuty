from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
from pulp import LpProblem, LpVariable, LpMinimize, lpSum, LpInteger, LpStatusOptimal, LpStatusInfeasible, LpStatus # LpStatus 추가
import random
import numpy as np # numpy 추가 (분산 계산용)

app = Flask(__name__)
CLOUDFLARE_PAGES_URL = "https://fairduty-beta.pages.dev" 
LOCALHOST_DEV_URL = "http://localhost:3000"
CAPACITATOR_DEV_URL = "capacitor://localhost"
ANDROID_LOCALHOST_URL = "http://localhost"
ANDROID_LOCALHOST_URL2 = "https://localhost"

allowed_origins = [
    CLOUDFLARE_PAGES_URL,
    LOCALHOST_DEV_URL,
    CAPACITATOR_DEV_URL,
    ANDROID_LOCALHOST_URL
]

CORS(app, 
     origins=allowed_origins,  # 허용할 출처 목록 전달
     supports_credentials=True, # 자격 증명(쿠키 등)을 포함한 요청 허용 여부
     methods=["GET", "POST", "OPTIONS"], # 허용할 HTTP 메소드 (필요에 따라 추가/수정)
     allow_headers=["Content-Type", "Authorization"] # 허용할 요청 헤더 (필요에 따라 추가/수정)
)

# --- 기존 generate_dates_revised 함수 (주말 및 사용자 지정 공휴일만 처리) ---
def generate_dates_revised(start_str, end_str, extra_holidays_set):
    start_dt = datetime.strptime(start_str, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_str, "%Y-%m-%d").date()
    days = []
    current_dt = start_dt
    while current_dt <= end_dt:
        is_extra_holiday = current_dt in extra_holidays_set
        days.append({
            "date": current_dt.strftime("%Y-%m-%d"),
            "weekday": current_dt.weekday(),
            "is_weekend": current_dt.weekday() >= 5,
            "is_holiday": is_extra_holiday
        })
        current_dt += timedelta(days=1)
    return days

# --- 분산 계산 함수 ---
def calculate_variances(summary_data, people_names_list):
    person_to_duties = {item['person']: item for item in summary_data}
    
    weekday_duties = np.array([person_to_duties.get(p, {}).get('weekdayDuties', 0) for p in people_names_list])
    weekend_holiday_duties = np.array([person_to_duties.get(p, {}).get('weekendOrHolidayDuties', 0) for p in people_names_list])

    var_weekday = np.var(weekday_duties) if len(weekday_duties) > 1 else 0.0
    var_weekend_holiday = np.var(weekend_holiday_duties) if len(weekend_holiday_duties) > 1 else 0.0
    
    return var_weekday, var_weekend_holiday

# --- 코어 LP 솔버 함수 (리팩토링됨) ---
def _solve_single_schedule_lp(
    start_date_str, end_date_str, people_data_input, duty_per_day_val, 
    allow_consecutive_flag, extra_holidays_str_list,
    objective_config=None # 예: {'type': 'PRIMARY_FAIRNESS'} 또는 {'type': 'RANDOMIZED_SECONDARY', 'target_range': X}
):
    people_names = [p['name'] for p in people_data_input]
    
    unavailable_dates_map = {p_data['name']: p_data.get('unavailable', []) for p_data in people_data_input}

    user_extra_holidays_set = set()
    for d_str in extra_holidays_str_list:
        try:
            date_obj = datetime.strptime(d_str, "%Y-%m-%d").date()
            user_extra_holidays_set.add(date_obj)
        except ValueError:
            app.logger.warning(f"잘못된 추가 공휴일 날짜 형식 (무시됨): {d_str}")

    # generate_dates_revised 함수 사용
    date_info_list = generate_dates_revised(start_date_str, end_date_str, user_extra_holidays_set)
    
    # 실제 스케줄링 대상 날짜 문자열 리스트
    schedule_date_strings = [d_info['date'] for d_info in date_info_list]

    if not schedule_date_strings:
        return None, "EmptyDateRange", None

    prob = LpProblem("DutyScheduling", LpMinimize) # 기본 sense, 목적 함수에서 재정의 가능

    # 변수 정의
    # x[person_name, date_string]
    duty_vars = LpVariable.dicts("duty", [(pn, ds) for pn in people_names for ds in schedule_date_strings], 0, 1, LpInteger)
    
    # 개인별 총 근무일 변수
    person_total_duties = LpVariable.dicts("person_total_duties", people_names, 0, cat=LpInteger)
    # 전체 근무일 중 최대/최소값 변수
    max_duties_across_people = LpVariable("max_duties_across_people", 0, cat=LpInteger)
    min_duties_across_people = LpVariable("min_duties_across_people", 0, cat=LpInteger)

    # 기본 제약조건
    for pn in people_names:
        # 각 개인의 총 근무일 계산
        prob += person_total_duties[pn] == lpSum(duty_vars[(pn, ds)] for ds in schedule_date_strings)
        # 최대/최소 근무일 제약
        prob += max_duties_across_people >= person_total_duties[pn]
        prob += min_duties_across_people <= person_total_duties[pn]

    # 당직 불가일 제약
    for pn, un_dates in unavailable_dates_map.items():
        for un_date_str in un_dates:
            if un_date_str in schedule_date_strings: # 스케줄 범위 내의 불가일만 처리
                prob += duty_vars[(pn, un_date_str)] == 0, f"Unavailable_{pn}_{un_date_str.replace('-', '')}"

    # 하루당 당직 인원 제약
    for ds in schedule_date_strings:
        prob += lpSum(duty_vars[(pn, ds)] for pn in people_names) == duty_per_day_val, f"DutyPerDay_{ds.replace('-', '')}"

    # 연속 당직 금지 제약
    if not allow_consecutive_flag:
        for pn in people_names:
            for i in range(len(schedule_date_strings) - 1):
                d1, d2 = schedule_date_strings[i], schedule_date_strings[i+1]
                prob += duty_vars[(pn, d1)] + duty_vars[(pn, d2)] <= 1, f"NoConsecutive_{pn}_{d1.replace('-', '')}_{d2.replace('-', '')}"
    
    achieved_total_duty_range = None

    # 목적 함수 및 관련 제약 설정
    if objective_config and objective_config.get('type') == 'PRIMARY_FAIRNESS':
        prob.objective = max_duties_across_people - min_duties_across_people
        prob.sense = LpMinimize
    elif objective_config and objective_config.get('type') == 'RANDOMIZED_SECONDARY':
        target_range = objective_config.get('target_range')
        if target_range is None:
            return None, "MissingTargetRangeForSecondary", None
        
        # 1단계에서 찾은 최적의 '총 근무일 차이'를 강제하는 제약 추가
        prob += (max_duties_across_people - min_duties_across_people) == target_range, "EnforcePrimaryFairness"
        
        # 무작위 계수를 가진 부차적 목적 함수 (탐색 다양성 확보용)
        random_coeffs = {(pn, ds): random.uniform(0.01, 0.5) for pn in people_names for ds in schedule_date_strings}
        prob.objective = lpSum(random_coeffs[(pn, ds)] * duty_vars[(pn, ds)] for pn in people_names for ds in schedule_date_strings)
        prob.sense = LpMinimize # 또는 LpMaximize, tie-breaking 용도
    else: # 기본값 또는 잘못된 설정 시: PRIMARY_FAIRNESS로 동작
        prob.objective = max_duties_across_people - min_duties_across_people
        prob.sense = LpMinimize

    prob.solve() # CBC 기본 솔버 사용

    if prob.status == LpStatusOptimal:
        roster = []
        counts = {pn: {"weekday": 0, "weekend_or_holiday": 0} for pn in people_names}
        for d_info in date_info_list:
            ds = d_info['date']
            assigned_today = [pn for pn in people_names if duty_vars[(pn, ds)].varValue == 1]
            roster.append({"date": ds, "weekday": d_info['weekday'], "duty": ", ".join(assigned_today)})
            for pn_assigned in assigned_today:
                if d_info['is_weekend'] or d_info['is_holiday']:
                    counts[pn_assigned]["weekend_or_holiday"] += 1
                else:
                    counts[pn_assigned]["weekday"] += 1
        
        summary = [{"person": pn, 
                      "weekdayDuties": counts[pn]["weekday"], 
                      "weekendOrHolidayDuties": counts[pn]["weekend_or_holiday"]} 
                     for pn in people_names]
        
        result_payload = {"dutyRoster": roster, "summary": summary}
        
        if objective_config and objective_config.get('type') == 'PRIMARY_FAIRNESS':
            achieved_total_duty_range = max_duties_across_people.varValue - min_duties_across_people.varValue

        return result_payload, "Optimal", achieved_total_duty_range
    
    status_map = {LpStatusInfeasible: "Infeasible"}
    return None, status_map.get(prob.status, f"SolverError_{LpStatus[prob.status]}"), None


# --- 다단계 최적화 실행 함수 ---
def generate_schedule_multi_stage(
    start_date, end_date, people_list_input, duties_per_day, 
    no_consecutive, extra_holidays, num_attempts=50 # 시도 횟수 기본 50
):
    people_names_list = [p['name'] for p in people_list_input]

    # 1단계: 개인별 총 당직 횟수 차이의 최적값 결정
    app.logger.info("1단계: 최적의 총 당직일 차이 계산 시작")
    initial_solution_data, initial_status, optimal_total_duty_range = _solve_single_schedule_lp(
        start_date, end_date, people_list_input, duties_per_day,
        not no_consecutive, # allow_consecutive_flag 로 변환
        extra_holidays,
        objective_config={'type': 'PRIMARY_FAIRNESS'}
    )

    if initial_status != "Optimal" or optimal_total_duty_range is None:
        app.logger.error(f"1단계 실패: {initial_status}")
        error_message_map = {
            "Infeasible": "초기 조건으로 스케줄 생성이 불가능합니다 (1단계). 당직 불가일 등을 확인해주세요.",
            "EmptyDateRange": "선택된 기간에 날짜가 없습니다."
        }
        return None, error_message_map.get(initial_status, f"1단계 스케줄 생성 실패: {initial_status}")

    app.logger.info(f"1단계 완료: 최적 총 당직일 차이 = {optimal_total_duty_range}")

    candidate_solutions = []
    app.logger.info(f"2단계: 다양한 후보군 생성 시작 (목표 {num_attempts}개)")

    for i in range(num_attempts):
        attempt_solution_data, attempt_status, _ = _solve_single_schedule_lp(
            start_date, end_date, people_list_input, duties_per_day,
            not no_consecutive, # allow_consecutive_flag
            extra_holidays,
            objective_config={'type': 'RANDOMIZED_SECONDARY', 'target_range': optimal_total_duty_range}
        )

        if attempt_status == "Optimal" and attempt_solution_data:
            var_weekday, var_weekend_holiday = calculate_variances(attempt_solution_data['summary'], people_names_list)
            candidate_solutions.append({
                "data": attempt_solution_data, # dutyRoster, summary 포함
                "var_weekday": var_weekday,
                "var_weekend_holiday": var_weekend_holiday,
                "combined_variance": var_weekday + var_weekend_holiday # 이 값을 기준으로 최종 선택
            })
            app.logger.info(f"  후보 {len(candidate_solutions)} 생성됨 (시도 {i+1}/{num_attempts}) - 주중분산: {var_weekday:.4f}, 주말분산: {var_weekend_holiday:.4f}")
        else:
             app.logger.warning(f"  시도 {i+1}/{num_attempts} 실패 또는 최적해 없음: {attempt_status}")


    if not candidate_solutions:
        app.logger.error("2단계 실패: 유효한 후보 스케줄을 하나도 생성하지 못했습니다.")
        return None, "2단계에서 유효한 후보 스케줄을 찾지 못했습니다. 초기 조건이 너무 엄격할 수 있습니다."
    
    app.logger.info(f"2단계 완료: 총 {len(candidate_solutions)}개의 후보 스케줄 생성됨")
    app.logger.info("3단계: 최종 스케줄 선택 시작")

    # 3단계: 분산이 가장 낮은 스케줄 선택
    best_candidate = min(candidate_solutions, key=lambda s: s['combined_variance'])
    
    app.logger.info(f"3단계 완료: 최종 스케줄 선택됨 (주중분산: {best_candidate['var_weekday']:.4f}, 주말분산: {best_candidate['var_weekend_holiday']:.4f})")
    
    return best_candidate['data'], "OptimalMultiStage"


# --- Flask API 엔드포인트 ---
@app.route('/api/schedule', methods=['POST'])
def create_schedule_route():
    data = request.get_json()
    start_date = data.get('startDate')
    end_date = data.get('endDate')
    people_data_input = data.get('people', [])
    no_consecutive_frontend = data.get('noConsecutive', True) # 프론트엔드: true=연속당직금지
    duty_per_day = data.get('dutyPerDay', 1)
    extra_holidays_list_input = data.get('extraHolidays', [])

    if not start_date or not end_date or not people_data_input or duty_per_day < 0:
        return jsonify({"error": "필수 정보가 부족합니다. 시작일, 종료일, 인원 목록, 일일 당직자 수를 확인해주세요."}), 400
    
    if len(people_data_input) < duty_per_day :
        return jsonify({"error": f"전체 인원({len(people_data_input)}명)이 하루 당직자 수({duty_per_day}명)보다 적습니다."}), 400

    # 하루 당직자 수가 0인 경우, 이전 로직대로 간단히 처리 (LP 불필요)
    if duty_per_day == 0:
        temp_extra_holidays_set = set()
        for d_str in extra_holidays_list_input:
            try: temp_extra_holidays_set.add(datetime.strptime(d_str, "%Y-%m-%d").date())
            except ValueError: pass
        
        date_list_for_empty = generate_dates_revised(start_date, end_date, temp_extra_holidays_set)
        empty_roster = [{"date": d["date"], "weekday": ["월","화","수","목","금","토","일"][d["weekday"]], "duty": ""} for d in date_list_for_empty]
        empty_summary = [{"person": p['name'], "weekdayDuties": 0, "weekendOrHolidayDuties": 0} for p in people_data_input]
        return jsonify({"dutyRoster": empty_roster, "summary": empty_summary})

    # 다단계 최적화 함수 호출
    final_schedule_data, status_message = generate_schedule_multi_stage(
        start_date,
        end_date,
        people_data_input,
        duty_per_day,
        no_consecutive_frontend, # 프론트엔드 값 그대로 전달 (함수 내부에서 allow_consecutive로 변환)
        extra_holidays_list_input,
        num_attempts=50 # 필요시 이 값을 조절하거나 요청 파라미터로 받을 수 있습니다.
    )

    if final_schedule_data:
        app.logger.info(f"최종 스케줄 생성 성공: {status_message}")
        return jsonify(final_schedule_data)
    else:
        app.logger.error(f"최종 스케줄 생성 실패: {status_message}")
        # status_message에 이미 사용자 친화적인 메시지가 포함되어 있을 수 있음
        return jsonify({"error": status_message}), 500


import os

if __name__ == '__main__':
    # Heroku는 PORT 환경 변수를 사용
    # port = int(os.environ.get('PORT', 5000)) 
    # app.logger.setLevel("INFO") # DEBUG, INFO, WARNING, ERROR, CRITICAL
    port = int(os.environ.get('PORT', 5000)) 
    app.run(host='0.0.0.0', port=port, debug=False)