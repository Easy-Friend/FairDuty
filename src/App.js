// src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css'; // DatePicker 기본 스타일 유지
import './App.css'; // 우리가 만들 App.css 파일을 불러옵니다.
import { v4 as uuidv4 } from 'uuid';
import html2canvas from 'html2canvas'

//날짜를 자꾸 하루 뒤로 넣어서 해결하려고함
function formatDateToYYYYMMDD(date) {
  if (!date) return null;
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // getMonth()는 0부터 시작하므로 +1
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`; 
}

// 날짜가 같은지 확인하는 헬퍼 함수
function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// 특정 기간 내의 모든 날짜를 가져오는 헬퍼 함수
function getAllDatesInRange(start, end) {
  if (!start || !end) return [];
  const dates = [];
  let current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const lightColorsPalette = [
  '#FFDDC1', // 아주 연한 주황 (살구색)
  '#FFABAB', // 아주 연한 빨강 (연분홍)
  '#DDFFDD', // 아주 연한 초록 (민트 크림)
  '#A8E6CF', // 연한 민트
  '#DCEDC1', // 연한 연두
  '#FFFACD', // 레몬 쉬폰 (연노랑)
  '#E6E6FA', // 라벤더 (연보라)
  '#D4F0F0', // 아주 연한 하늘색
  '#F0E68C', // 카키색 비슷한 연노랑
  '#FFDEAD'  // 나바호 화이트 (연한 살구색)
];

const calculateMaxEndDate = (selectedStartDate) => {
  if (!selectedStartDate) {
    return null; // 시작 날짜가 없으면 종료 날짜 제한 없음
  }
  const maxEndDate = new Date(selectedStartDate);
  maxEndDate.setDate(selectedStartDate.getDate() + (6 * 7) - 1); 
  return maxEndDate;
};

function App() {
  const { t, i18n } = useTranslation(); // 2. useTranslation Hook 사용
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const maxSelectableEndDate = calculateMaxEndDate(startDate);

  const [people, setPeople] = useState([]);
  const [nameInput, setNameInput] = useState('');
  const [noConsecutive, setNoConsecutive] = useState(true);
  const [dutyPerDay, setDutyPerDay] = useState(1);
  const [extraHolidays, setExtraHolidays] = useState([]);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [personColorMap, setPersonColorMap] = useState({}); 
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const extraHolidayHighlightConfig = extraHolidays.length > 0 
  ? [{ "highlighted-extra-holiday": extraHolidays }] 
  : [];

  const generateButtonRef = useRef(null); // "당직표 생성" 버튼을 위한 ref 생성

  const handleNameKeyPress = (e) => {
    if (e.key === 'Enter' && nameInput.trim()) {
      if (people.length >= 10) {
        setError(t('errors.maxPeopleReached', '최대 10명까지만 추가할 수 있습니다.')); // 다국어 처리된 오류 메시지
        // setNameInput(''); // 입력창을 비울 수도 있고, 그대로 둘 수도 있습니다.
        return; // 함수 종료하여 더 이상 추가되지 않도록 함
      }
      setPeople((prev) => [...prev, { id: uuidv4(), name: nameInput.trim(), unavailable: [] }]);
      setNameInput('');
      setError(null);
    }
  };

  const removePerson = (idToRemove) => {
    setPeople((prev) => prev.filter(person => person.id !== idToRemove));
  };

  const handleUnavailableChange = (id, dates) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === id ? { ...p, unavailable: dates } : p))
    );
  };

  const handleExtraHolidaysChange = (date) => {
    setExtraHolidays((prevHolidays) => {
      const dateExists = prevHolidays.some((d) => isSameDay(d, date));
      if (dateExists) {
        return prevHolidays.filter((d) => !isSameDay(d, date));
      } else {
        return date ? [...prevHolidays, date].sort((a, b) => a - b) : prevHolidays;
      }
    });
  };

  const handleGenerateSchedule = async () => {
    if (!startDate || !endDate) {
      setError(t('errors.dateRangeMissing'));
      return;
    }
    if (people.length === 0) {
      setError(t('errors.peopleMissing'));
      return;
    }
    setLoading(true);
    setError(null);
    setScheduleResult(null);

    const API_BASE_URL = process.env.REACT_APP_API_URL; // 환경 변수 사용
    if (!API_BASE_URL) {
      console.error("API URL is not defined. Check REACT_APP_API_URL environment variable.");
      setError("API 설정 오류: 서버 주소가 정의되지 않았습니다."); // 사용자에게 알림
      setLoading(false);
      return;
    }    

    const payload = {
      startDate: formatDateToYYYYMMDD(startDate), // 수정된 부분
      endDate: formatDateToYYYYMMDD(endDate),     // 수정된 부분
      people: people.map(p => ({
        name: p.name,
        unavailable: (p.unavailable || []).map(date => formatDateToYYYYMMDD(date)), // 불가 날짜도 동일하게 수정
      })),
      noConsecutive: noConsecutive,
      dutyPerDay: parseInt(dutyPerDay, 10),
      extraHolidays: (extraHolidays || []).map(date => formatDateToYYYYMMDD(date)), // 추가 공휴일도 동일하게 수정
    };

    // ▼▼▼ 디버깅을 위해 이 부분을 추가합니다 ▼▼▼
    console.log("--- Payload to be sent ---");
    console.log("Raw extraHolidays state:", extraHolidays); // 현재 extraHolidays 상태 배열
    console.log("Formatted extraHolidays in payload:", payload.extraHolidays); // 변환된 extraHolidays
    console.log("Full payload:", JSON.stringify(payload, null, 2));
    // ▲▲▲ 디버깅 코드 끝 ▲▲▲

    try {
      const response = await fetch(`${API_BASE_URL}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        // 동적 값(status)을 포함한 번역 처리
        throw new Error(errorData.error || t('errors.scheduleGenerationFailed', { status: response.status })); // 변경
      }
      const data = await response.json();
      setScheduleResult(data);
    } catch (err) {
      // err.message가 백엔드에서 온 번역된 메시지일 수도 있으므로, 우선 표시
      // 그렇지 않다면 t('errors.unknown') 사용
      setError(err.message && err.message !== t('errors.scheduleGenerationFailed', { status: '...' }) ? err.message : t('errors.unknown')); // 변경 (좀 더 견고한 오류 메시지 처리)
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadImage = async () => {
    setLoading(true);
    try {
      const resultsContainer = document.querySelector('.results-container');
      if (!resultsContainer) {
        console.error("Cannot find .results-container to download.");
        setError("다운로드할 내용을 찾을 수 없습니다.");
        return;
      }

      const canvas = await html2canvas(resultsContainer, {
        width: resultsContainer.scrollWidth,    // 요소의 전체 너비 사용
        height: resultsContainer.scrollHeight,  // 요소의 전체 높이 사용
        windowWidth: resultsContainer.scrollWidth, // 캔버스 렌더링 시 사용할 창 너비
        windowHeight: resultsContainer.scrollHeight, // 캔버스 렌더링 시 사용할 창 높이
        backgroundColor: '#ffffff',             // 캡처 이미지의 배경색을 흰색으로 지정
        useCORS: true,
      });

      const dataURL = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = 'duty_roster.png'; // 다운로드될 파일 이름
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error during image download:", error);
      setError("이미지 다운로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const renderCalendar = () => {
    if (!startDate || !endDate || !scheduleResult?.dutyRoster) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const calendarViews = [];
    let currentDateIter = new Date(start.getFullYear(), start.getMonth(), 1);
    
    const dutyRosterMap = {};
    scheduleResult.dutyRoster.forEach(item => {
      dutyRosterMap[item.date] = typeof item.duty === 'string' ? item.duty.split(',').map(s => s.trim()).filter(s => s) : [];
    });
    const extraHolidaysSet = new Set(extraHolidays.map(d => formatDateToYYYYMMDD(d))); // YYYY-MM-DD 형식으로 비교

    // 달력 요일 이름 (번역된 값 사용)
    const dayNames = t('calendarDayNames', { returnObjects: true }) || ['일', '월', '화', '수', '목', '금', '토'];


    while (currentDateIter <= end && currentDateIter.getFullYear() <= end.getFullYear()) {
      const year = currentDateIter.getFullYear();
      const month = currentDateIter.getMonth();
      const firstDayOfMonth = new Date(year, month, 1);
      const lastDayOfMonth = new Date(year, month + 1, 0);
      if (month < start.getMonth() && year === start.getFullYear()) {
        currentDateIter.setMonth(currentDateIter.getMonth() + 1);
        continue;
      }
      if (month > end.getMonth() && year === end.getFullYear()) break;

      const firstDayOfWeek = firstDayOfMonth.getDay();
      const daysInMonth = lastDayOfMonth.getDate();
      let dayCounter = 1;
      const weeks = [];
      while (dayCounter <= daysInMonth) {
        const week = Array(7).fill(null);
        for (let i = 0; i < 7; i++) {
          if ((weeks.length === 0 && i >= firstDayOfWeek) || (weeks.length > 0 && dayCounter <= daysInMonth)) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
            const duty = dutyRosterMap[dateStr] || [];
            const currentDayObj = new Date(year, month, dayCounter);
            const dayOfWeekNum = currentDayObj.getDay();
            const weekdayKorean = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeekNum];
            if (currentDayObj >= start && currentDayObj <= end) {
              week[i] = {
                day: dayCounter, duty: duty, dayOfWeek: weekdayKorean,
                isWeekend: dayOfWeekNum === 0 || dayOfWeekNum === 6,
                isExtraHoliday: extraHolidaysSet.has(dateStr),
                dateStr: dateStr
              };
            }
            dayCounter++;
          }
        }
        weeks.push(week);
      }
      calendarViews.push(
        <div key={`${year}-${month}`} className="calendar-month">
          <h3>{t('calendarYear', { year: year })} {t('calendarMonth', { month: month + 1 })}</h3>
          <table className="duty-calendar-table">
            <thead>
              <tr>
                {/* 요일 이름 번역 처리 */}
                {dayNames.map((day, index) => (
                  <th key={day} className={index === 0 ? 'sunday-header' : index === 6 ? 'saturday-header' : ''}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIndex) => (
                <tr key={weekIndex}>
                  {week.map((dayInfo, dayCellIndex) => {
                    let cellClasses = "calendar-day-cell";
                    let dayNumberClasses = "day-number";
                    if (dayInfo) {
                      if (dayInfo.isWeekend) cellClasses += " weekend-cell";
                      if (dayInfo.isExtraHoliday) cellClasses += " extra-holiday-cell";
                      if (dayInfo.isWeekend || dayInfo.isExtraHoliday) dayNumberClasses += " red-text";
                    } else {
                      cellClasses += " empty-cell";
                    }
                    return (
                      <td key={dayCellIndex} className={cellClasses}>
                        {dayInfo && (
                          <>
                            <div className={dayNumberClasses}>{dayInfo.day}</div>
                            {dayInfo.duty && dayInfo.duty.length > 0 && (
                              <div className="duty-personnel-list">
                                {dayInfo.duty
                                  .slice() // 원본 배열 변경 방지를 위해 복사본 생성 (선택 사항이지만 안전함)
                                  .sort((a, b) => a.localeCompare(b, 'ko')) // 'ko' 로케일을 사용하여 한국어 기준으로 정렬
                                  .map(name => (
                                  <div 
                                    key={name} 
                                    className="duty-person"
                                    style={{ 
                                      backgroundColor: personColorMap[name] || '#f0f0f0' // 할당된 색상 적용, 없으면 기본 연회색
                                    }}
                                  >
                                    {name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentDateIter.setMonth(currentDateIter.getMonth() + 1);
      if (currentDateIter.getFullYear() === year && currentDateIter.getMonth() === month) {
        currentDateIter.setMonth(month === 11 ? 0 : month + 1);
        if (month === 11) currentDateIter.setFullYear(year + 1);
      }
    }
    return calendarViews;
  };

  useEffect(() => {
    if (scheduleResult && !error && generateButtonRef.current) {
      // "당직표 생성" 버튼이 화면 상단에 오도록 스크롤
      generateButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scheduleResult, error]);

  useEffect(() => {
    if (scheduleResult && scheduleResult.summary) {
      const newColorMap = {};
      // scheduleResult.summary에 있는 사람 목록을 기준으로 색상 할당
      // (이 summary에는 해당 스케줄에 한번이라도 당직이 있는 모든 사람이 포함됩니다)
      scheduleResult.summary.forEach((summaryItem, index) => {
        newColorMap[summaryItem.person] = 
          lightColorsPalette[index % lightColorsPalette.length]; // 팔레트 색상을 순환하며 할당
      });
      setPersonColorMap(newColorMap);
    } else {
      setPersonColorMap({}); // 스케줄이 없으면 색상 맵도 비움
    }
  }, [scheduleResult]); // scheduleResult가 변경될 때마다 실행

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>⚖️ {t('appTitle')}</h1>
        <p style={{ margin: 0 }}> {/* p 태그의 기본 마진 제거 */}
          {t('appDescriptionLine1')}<br />
          {t('appDescriptionLine2')}<br />
          <span style={{ fontSize: '0.7em', color: '#777' }}>Made by EasyFriend</span> {/* "by" 라인 스타일 약간 다르게 (선택 사항) */}
        </p>
      </header>

      <div className="settings-layout"> {/* 메인 설정 영역을 감싸는 div */}
        {/* 왼쪽 패널 */}
        <div className="left-panel panel">
          <div className="setting-group">
            <label className="label">{t('dateRangeLabel')}</label>
            <DatePicker
              selectsRange
              startDate={startDate}
              endDate={endDate}
              onChange={(update) => setDateRange(update)}
              dateFormat="yyyy-MM-dd"
              placeholderText={t('datePickerPlaceholder')}
              className="date-picker-input" // CSS에서 스타일링 할 수 있도록 클래스 추가
              isClearable={true}
              minDate={new Date()}
              maxDate={maxSelectableEndDate}
            />
          </div>
          
          <div className="setting-group">
            <label className="label">{t('extraHolidaysLabel')}</label>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>            
              <DatePicker
                selected={null}
                onChange={handleExtraHolidaysChange}
                highlightDates={extraHolidayHighlightConfig} 
                dateFormat="yyyy-MM-dd"
                placeholderText={t('extraHolidaysPickerPlaceholder')}
                inline
                monthsShown={1}
                className="full-width-datepicker" // DatePicker 컨테이너에 클래스 추가
              />
            </div>
            {extraHolidays.length > 0 && (
              <div className="selected-dates-info" style={{ textAlign: 'right', marginTop: '5px' }}>
                {t('selectedExtraHolidaysPrefix')}
                {extraHolidays.map(d => d.toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })).join(', ')}
              </div>
            )}
          </div>

          <div className="setting-group">
            <label className="label" htmlFor="dutyPerDayInput">{t('dutyPerDayLabel')}</label>
            <input
              id="dutyPerDayInput"
              type="number"
              value={dutyPerDay}
              onChange={(e) => setDutyPerDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="number-input"
              min="1"
            />
          </div>

          <div className="setting-group checkbox-group">
            <input
              id="noConsecutive"
              type="checkbox"
              checked={noConsecutive}
              onChange={() => setNoConsecutive((prev) => !prev)}
            />
            <label htmlFor="noConsecutive" className="checkbox-label">{t('noConsecutiveLabel')}</label>
          </div>
        </div>

        {/* 오른쪽 패널 */}
        <div className="right-panel panel">
          <div className="setting-group">
            <label className="label" htmlFor="personNameInput">{t('addPersonLabel')}</label>
            <input
              id="personNameInput"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleNameKeyPress}
              className="text-input"
              placeholder={t('addPersonPlaceholder')}
              disabled={people.length >= 10} 
            />
            <div className="people-list">
              {people.map((person) => (
                <div key={person.id} className="person-item">
                  <span>{person.name}</span>
                  <button onClick={() => removePerson(person.id)} className="remove-button">
                    {t('removePersonButton')} {/* 변경 */}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <h2 className="sub-header">{t('unavailableDatesForPersonLabel')}</h2>
            {people.length === 0 && <p className="info-text">{t('addPersonFirst')}</p>}
            <div className="unavailable-dates-grid">
              {people.map((person) => {
                const unavailableDatesForPerson = person.unavailable || [];
                const unavailableHighlightConfig = unavailableDatesForPerson.length > 0
                ? [{ "highlighted-unavailable-date": unavailableDatesForPerson }]
                : [];
                return(
                <div key={person.id} className="person-unavailable-picker">
                  <p className="person-name-label">{person.name} - {t('unavailableDatesLabel')}</p>
                  <div className="selected-dates-info">
                    {person.unavailable && person.unavailable.length > 0 ? (
                      <>
                        {t('selectedUnavailableDatesPrefix')}
                        <span className="unavailable-dates-text">
                          {person.unavailable.map(date => date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })).join(', ')}
                        </span>
                      </>
                    ) : (
                      <span className="no-dates-text">{t('noUnavailableDates')}</span>
                    )}
                  </div>
                  <DatePicker
                    selected={null}
                    onChange={(date) => {
                      if (!date) return;
                      const current = person.unavailable || [];
                      const exists = current.some((d) => isSameDay(d, date));
                      let newDates = exists ? current.filter((d) => !isSameDay(d, date)) : [...current, date];
                      newDates.sort((a, b) => a - b);
                      handleUnavailableChange(person.id, newDates);
                    }}
                    // highlightDates={(person.unavailable || []).map(d => ({ date: d, className: 'highlighted-unavailable-date' }))}                    
                    highlightDates={unavailableHighlightConfig} 

                    includeDates={startDate && endDate ? getAllDatesInRange(startDate, endDate) : undefined}
                    inline
                    monthsShown={1}
                    minDate={startDate}
                    maxDate={endDate}
                    className="full-width-datepicker" // DatePicker 컨테이너에 클래스 추가
                  />
                </div>
              );
              })}
            </div>
          </div>
        </div> {/* 오른쪽 패널 끝 */}
      </div> {/* settings-layout 끝 */}
      
      <div className="generate-button-container">
        <button
          ref={generateButtonRef} 
          onClick={handleGenerateSchedule}
          disabled={loading || !startDate || !endDate || people.length === 0}
          className="generate-button"
        >
          {loading ? t('loadingMessage') : `🚀 ${t('generateButton')}`}
        </button>
      </div>

      {error && (
        <div className="error-message-box">
          <p>{t('errorOccurred')}</p> {/* "오류 발생!" 이라는 일반적인 제목은 번역 */}
          <p>{error}</p> {/* 백엔드에서 전달된 구체적인 오류 메시지를 그대로 표시 */}
        </div>
      )}

      {scheduleResult && !error && (
        <div className="results-container">
          <h2 className="results-header">📆 {t('generatedScheduleTitle')}</h2>
          <div className="calendar-wrapper">
            {renderCalendar()}
          </div>

          <h2 className="results-header">📊 {t('summaryTitle')}</h2>
          <div className="summary-wrapper">
            <ul className="summary-list">
              {scheduleResult.summary.map((item) => (
                <li key={item.person} className="summary-item">
                  <span>{item.person}</span>
                  <span>
                    {t('summaryWeekday')}: {item.weekdayDuties}, {t('summaryWeekendOrHoliday')}: {item.weekendOrHolidayDuties} ({t('summaryTotal')}: {item.weekdayDuties + item.weekendOrHolidayDuties}회)
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="buttons-container" style={{ marginTop: '25px', marginBottom: '20px', textAlign: 'center' }}>
            <button
              onClick={handleGenerateSchedule} // 동일한 함수 호출
              disabled={loading || !startDate || !endDate || people.length === 0} // 동일한 비활성화 조건
              className="generate-button" // 기존 버튼과 동일한 스타일 적용 (필요시 다른 클래스 지정 가능)
            >
              {loading ? t('loadingMessage') : t('remakeButtonLabel')}
            </button>
            {scheduleResult && (
              <button
                onClick={handleDownloadImage}
                disabled={loading}
                className="download-button" // 새로운 클래스 추가
                style={{ marginLeft: '10px' }} // "다시 만들기" 버튼과의 간격
              >
                {loading ? 'Downloading...' : '💾 Download'}
              </button>
            )}
          </div>    
        </div>
      )}

      {/* <div className="app-store-links-container" 
        style={{ 
          textAlign: 'center', 
          padding: '30px 20px', 
          marginTop: '40px', 
          borderTop: '1px solid #eee' 
        }}>
        <h3 style={{ marginBottom: '10px' }}>{t('getApp.title', '모든 기능을 경험하세요!')}</h3>
        <p style={{ marginBottom: '20px', fontSize: '0.95em', color: '#444' }}>
          {t('getApp.description', '더 많은 고급 기능과 편리한 모바일 경험을 원하시면 지금 바로 앱을 다운로드하세요.')}
        </p>
        <div>
          <a 
            href="YOUR_GOOGLE_PLAY_STORE_URL_HERE" // 여기에 실제 구글 플레이 스토어 URL을 넣어주세요.
            target="_blank" 
            rel="noopener noreferrer" 
            className="store-button play-store-button" 
          >
            {t('getApp.googlePlay', 'Google Play에서 받기')}
          </a>
          <a 
            href="YOUR_APPLE_APP_STORE_URL_HERE" // 여기에 실제 애플 앱 스토어 URL을 넣어주세요.
            target="_blank" 
            rel="noopener noreferrer" 
            className="store-button app-store-button" 
          >
            {t('getApp.appStore', 'App Store에서 다운로드')}
          </a>
        </div>
      </div> */}

    </div>
  );
}

export default App;