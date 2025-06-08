// src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async'
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
  maxEndDate.setDate(selectedStartDate.getDate() + (5 * 7) - 1); 
  return maxEndDate;
};

const languageOptions = [
    { code: 'ko', name: '한국어', shortName: 'KOR'},
    { code: 'en', name: 'English', shortName: 'ENG'}, // 또는 🇬🇧
    { code: 'zh', name: '中文',    shortName: 'CHN'},
    { code: 'ja', name: '日本語',    shortName: 'JPN'},
    { code: 'es', name: 'Español',    shortName: 'ESP'},
    { code: 'pt', name: 'Português',    shortName: 'POR'},
    { code: 'hi', name: 'हिन्दी',    shortName: 'HIN'},
  ];

function App() {
  const { t, i18n } = useTranslation(); // 2. useTranslation Hook 사용
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);  
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const maxSelectableEndDate = calculateMaxEndDate(startDate);

  const [people, setPeople] = useState([]);
  const [nameInput, setNameInput] = useState('');
  const [noConsecutive, setNoConsecutive] = useState(true);
  const [dutyPerDay, setDutyPerDay] = useState(1);
  const [extraHolidays, setExtraHolidays] = useState([]);
  const [offDutyDays, setOffDutyDays] = useState([]);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [personColorMap, setPersonColorMap] = useState({}); 
  const [variableDutyDays, setVariableDutyDays] = useState({});

  const abortControllerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const selectLanguage = (lng) => {
    i18n.changeLanguage(lng); // 기존 changeLanguage 함수 사용 또는 직접 i18n.changeLanguage 호출
    setIsDropdownOpen(false); // 언어 선택 후 드롭다운 닫기
  };

  const currentLanguage = languageOptions.find(opt => opt.code === i18n.language) || languageOptions[1]


  // const extraHolidayHighlightConfig = extraHolidays.length > 0 
  // ? [{ "highlighted-extra-holiday": extraHolidays }] 
  // : [];

  const generateButtonRef = useRef(null); // "당직표 생성" 버튼을 위한 ref 생성

  useEffect(() => {
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleVariableDutyDayChange = (date) => {
    const dateKey = formatDateToYYYYMMDD(date); // YYYY-MM-DD 형식의 문자열 키
    
    setVariableDutyDays(prev => {
      const newVariableDays = { ...prev };
      if (newVariableDays[dateKey]) {
        delete newVariableDays[dateKey];
      } else {
        // 새로 선택된 날짜면 기본값 '2'로 목록에 추가
        // 기본 당직자 수가 1명이므로, 보통 다른 인원수는 2명 이상일 것을 가정
        newVariableDays[dateKey] = '2'; 
      }
      return newVariableDays;
    });
  };

    const handleVariableDutyCountChange = (dateKey, count) => {
    // 0이나 빈 값 입력 시 1로 처리
    const validatedCount = Math.max(1, parseInt(count, 10) || 1);
    
    setVariableDutyDays(prev => ({
      ...prev,
      [dateKey]: String(validatedCount) // 값을 문자열로 저장
    }));
  };

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // fetch 요청 중단
      console.log("Request cancellation initiated by user.");
    }
  };

  const handleNameKeyPress = (e) => {
    const newNameTrimmed = nameInput.trim(); // 공백 제거된 새 이름
    if (e.key === 'Enter' && newNameTrimmed) {
      // 1. 최대 인원수 제한 확인 (기존 로직)
      if (people.length >= 20) {
        setError(t('errors.maxPeopleReached', '최대 20명까지만 추가할 수 있습니다.'));
        return;
      }

      // ▼▼▼ 2. 중복 이름 확인 로직 추가 ▼▼▼
      // 대소문자를 구분하지 않고 비교하려면 toLowerCase() 또는 toUpperCase() 사용
      const nameExists = people.some(person => person.name.toLowerCase() === newNameTrimmed.toLowerCase()); 
      if (nameExists) {
        setError(t('errors.duplicateName', '이미 같은 이름의 인원이 있습니다. 다른 이름을 사용해주세요.'));
        return; // 함수 종료하여 추가하지 않음
      }
      setPeople((prev) => [...prev, { id: uuidv4(), name: nameInput.trim(), unavailable: [], mustDuty: [] }]);
      setNameInput('');
      setError(null);
    }
  };

  const removePerson = (idToRemove) => {
    setPeople((prev) => prev.filter(person => person.id !== idToRemove));
  };

  const handlePersonDateChange = (personId, date) => {
    setPeople(prevPeople =>
      prevPeople.map(person => {
        if (person.id === personId) {
          // isSameDay 헬퍼 함수를 사용하여 각 배열에 날짜가 있는지 확인
          const isUnavailable = (person.unavailable || []).some(d => isSameDay(d, date));
          const isMustDuty = (person.mustDuty || []).some(d => isSameDay(d, date));

          let newUnavailable = [...(person.unavailable || [])];
          let newMustDuty = [...(person.mustDuty || [])];

          if (isUnavailable) {
            // 1. 현재 "당직 불가" -> "꼭 당직"으로 변경
            newUnavailable = newUnavailable.filter(d => !isSameDay(d, date));
            newMustDuty = [...newMustDuty, date].sort((a, b) => a - b);
          } else if (isMustDuty) {
            // 2. 현재 "꼭 당직" -> 선택 취소
            newMustDuty = newMustDuty.filter(d => !isSameDay(d, date));
          } else {
            // 3. 현재 선택 없음 -> "당직 불가"로 변경
            newUnavailable = [...newUnavailable, date].sort((a, b) => a - b);
          }
          
          return { ...person, unavailable: newUnavailable, mustDuty: newMustDuty };
        }
        return person;
      })
    );
  };

  const handleMultiStateDateChange = (date) => {
    const isExtraHoliday = extraHolidays.some(d => isSameDay(d, date));
    const isOffDutyDay = offDutyDays.some(d => isSameDay(d, date));

    if (isExtraHoliday) {
      // 1. 현재 "추가 공휴일" -> "당직 없음"으로 변경
      setExtraHolidays(prev => prev.filter(d => !isSameDay(d, date)));
      setOffDutyDays(prev => [...prev, date].sort((a, b) => a - b));
    } else if (isOffDutyDay) {
      // 2. 현재 "당직 없음" -> 선택 취소
      setOffDutyDays(prev => prev.filter(d => !isSameDay(d, date)));
    } else {
      // 3. 현재 선택 없음 -> "추가 공휴일"로 변경
      setExtraHolidays(prev => [...prev, date].sort((a, b) => a - b));
    }
  };


  const handleGenerateSchedule = async () => {
    if (loading) {
        console.log("Already generating, please wait or cancel.");
        return; 
    }
    if (scheduleResult) { 
      const userConfirmed = window.confirm(t('confirmations.regenerateSchedule', '다운로드 하지 않은 당직표는 사라집니다. 계속 진행하시겠습니까?'));
      if (!userConfirmed) {
        return; // 사용자가 "취소"를 누르면 함수를 여기서 종료
      }
    }

    const parsedDutyPerDay = parseInt(dutyPerDay, 10);
    if (isNaN(parsedDutyPerDay) || parsedDutyPerDay < 1) {
      setError(t('errors.dutyPerDayInvalid', '하루 당직 인원은 1명 이상이어야 합니다.'));
      // 선택 사항: 유효하지 않은 값 입력 시 상태를 기본값 '1'로 되돌릴 수 있습니다.
      // setDutyPerDay('1'); 
      return; // 함수 종료
    }

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

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const API_BASE_URL = process.env.REACT_APP_API_URL; // 환경 변수 사용
    if (!API_BASE_URL) {
      console.error("API URL is not defined. Check REACT_APP_API_URL environment variable.");
      setError("API 설정 오류: 서버 주소가 정의되지 않았습니다."); // 사용자에게 알림
      setLoading(false);
      return;
    }
    
    const variableDutyDaysPayload = {};
    Object.entries(variableDutyDays).forEach(([dateKey, count]) => {
      if (count.trim() !== '') {
        variableDutyDaysPayload[dateKey] = parseInt(count, 10);
      }
    });

    const payload = {
      startDate: formatDateToYYYYMMDD(startDate), // 수정된 부분
      endDate: formatDateToYYYYMMDD(endDate),     // 수정된 부분
      people: people.map(p => ({
        name: p.name,
        unavailable: (p.unavailable || []).map(date => formatDateToYYYYMMDD(date)), 
        mustDuty: (p.mustDuty || []).map(date => formatDateToYYYYMMDD(date))
      })),
      noConsecutive: noConsecutive,
      dutyPerDay: parseInt(dutyPerDay, 10),
      extraHolidays: (extraHolidays || []).map(date => formatDateToYYYYMMDD(date)),
      offDutyDays: (offDutyDays || []).map(date => formatDateToYYYYMMDD(date)),
      variableDutyDays: variableDutyDaysPayload
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
        signal: signal 
      });

      abortControllerRef.current = null; 

      if (!response.ok) {
        const errorData = await response.json();
        // 동적 값(status)을 포함한 번역 처리
        throw new Error(errorData.error || t('errors.scheduleGenerationFailed', { status: response.status })); // 변경
      }
      const data = await response.json();
      setScheduleResult(data);
    } catch (err) {
      abortControllerRef.current = null; // 오류 발생 시에도 초기화
      if (err.name === 'AbortError') {
        console.log('Fetch aborted by user.');
        setError(t('errors.requestAborted', '요청이 취소되었습니다.')); // 취소 관련 메시지 (선택적)
      } else {
      // err.message가 백엔드에서 온 번역된 메시지일 수도 있으므로, 우선 표시
      // 그렇지 않다면 t('errors.unknown') 사용
      setError(err.message && err.message !== t('errors.scheduleGenerationFailed', { status: '...' }) ? err.message : t('errors.unknown')); 
      }
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
    const offDutyDaysSet = new Set(offDutyDays.map(d => formatDateToYYYYMMDD(d)));

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
                isOffDuty: offDutyDaysSet.has(dateStr),
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
                      if (dayInfo.isOffDuty) {
                        cellClasses += " off-duty-cell"; 
                      } else {
                        if (dayInfo.isWeekend) cellClasses += " weekend-cell";
                        if (dayInfo.isExtraHoliday) cellClasses += " extra-holiday-cell";
                      if (dayInfo.isWeekend || dayInfo.isExtraHoliday) dayNumberClasses += " red-text";
                      }
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
                                  .sort((a, b) => a.localeCompare(b,  i18n.language)) // 'ko' 로케일을 사용하여 한국어 기준으로 정렬
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
    <>
      <Helmet>
        <title>{t('seo.title', 'FairDuty - 공평한 자동 당직표 생성기')}</title>
        <meta name="description" content={t('seo.description', '복잡한 당직 스케줄, 이제 FairDuty로 쉽고 공정하게 관리하세요.')} />
      </Helmet>
      <div className="app-container">
        <div className="top-language-selector">
          <div className="language-selector-wrapper" ref={dropdownRef}> {/* ref를 여기에 적용 */}
            <button onClick={toggleDropdown} className="language-selector-button">
              <span className="lang-short-name">{currentLanguage.shortName}</span>
              <span className="dropdown-arrow">{isDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {isDropdownOpen && (
              <ul className="language-dropdown-menu">
                {languageOptions.map((option) => (
                  <li 
                    key={option.code} 
                    onClick={() => selectLanguage(option.code)}
                    className={i18n.language === option.code ? 'active' : ''}
                  >
                    <span>{option.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

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
                <div style={{ marginBottom: '15px', fontSize: '0.85em', color: '#666' }}>
                  <p style={{ margin: 0 }}>
                    {t('extraHolidays.description.line1')}
                  </p>
                  <ul style={{ paddingLeft: '20px', margin: '8px 0 0 0', listStyleType: 'disc' }}>
                    <li>{t('extraHolidays.description.click1', '첫 번째 클릭: 추가 공휴일')}</li>
                    <li>{t('extraHolidays.description.click2', '두 번째 클릭: 당직 없는 날')}</li>
                    <li>{t('extraHolidays.description.click3', '세 번째 클릭: 선택 취소')}</li>
                  </ul>
                </div>
                <div style={{ marginTop: '15px' }}> {/* 이 컨테이너는 줄어들지 않도록 설정 */}
                  <DatePicker
                    selected={null}
                    onChange={handleMultiStateDateChange}
                    highlightDates={[
                      { "highlighted-extra-holiday": extraHolidays },
                      { "highlighted-off-duty": offDutyDays }
                    ]}
                    inline
                    monthsShown={1}
                    className="full-width-datepicker" // DatePicker 컨테이너에 클래스 추가
                  />
                  {extraHolidays.length > 0 && (
                    <div className="selected-dates-info" style={{ marginTop: '5px' }}>
                      {t('selectedExtraHolidaysPrefix')}
                      {extraHolidays.map(d => d.toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })).join(', ')}
                    </div>
                  )}
                  {offDutyDays.length > 0 && (
                    <div 
                      className="selected-dates-info" 
                      style={{ marginTop: '5px' }} 
                    >
                      {t('selectedOffDutyDaysPrefix')}
                      {offDutyDays.map(d => d.toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })).join(', ')}
                    </div>
                  )}
                </div>
            </div>

            <div className="setting-group">
              <label className="label" htmlFor="dutyPerDayInput">{t('dutyPerDayLabel')}</label>
              <input
                id="dutyPerDayInput"
                type="number"
                value={dutyPerDay}
                onChange={(e) => setDutyPerDay(e.target.value)}
                className="number-input"
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
            <div className="setting-group">
              <label className="label">{t('variableDutyDays.label', '당직자 수가 달라지는 날')}</label>
              <p style={{ fontSize: '0.85em', color: '#666', marginTop: '-5px', marginBottom: '10px' }}>
                {t('variableDutyDays.description', '달력에서 날짜를 선택하면 아래에 해당 날짜의 당직 인원을 설정하는 입력칸이 나타납니다.')}
              </p>

              {/* 날짜 선택을 위한 DatePicker */}
              <DatePicker
                onChange={handleVariableDutyDayChange}
                selected={null} // 특정 날짜가 계속 선택된 상태로 보이지 않게 함
                inline
                monthsShown={1}
                highlightDates={[{ "highlighted-variable-duty": Object.keys(variableDutyDays).map(d => new Date(d)) }]}
              />
              
              {/* 선택된 날짜와 인원수 입력을 위한 동적 input 목록 */}
              <div className="variable-duty-inputs" style={{ marginTop: '10px' }}>
                {Object.entries(variableDutyDays)
                  // 날짜순으로 정렬하여 표시
                  .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB)) 
                  .map(([dateKey, count]) => (
                    <div key={dateKey} className="variable-duty-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                      <label htmlFor={`duty-count-${dateKey}`} style={{ marginRight: '10px' }}>
                        {dateKey}:
                      </label>
                      <select
                        id={`duty-count-${dateKey}`}
                        value={count} // 현재 설정된 값을 선택된 값으로 표시
                        onChange={(e) => handleVariableDutyCountChange(dateKey, e.target.value)}
                        className="number-select" // 새로운 CSS 클래스
                      >
                        {/* 1부터 20까지의 숫자를 옵션으로 생성 */}
                        {[...Array(20).keys()].map(i => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                ))}
              </div>
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
                disabled={people.length >= 20} 
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
              <p style={{ fontSize: '0.85em', color: '#666', marginTop: '-5px', marginBottom: '15px' }}>
                {t('personUnavailable.description')}
              </p>              
              {people.length === 0 && <p className="info-text">{t('addPersonFirst')}</p>}
              <div className="unavailable-dates-grid">
                {people.map((person) => {
                  const personHighlightConfig = [
                    { "highlighted-unavailable-date": person.unavailable || [] },
                    { "highlighted-must-duty": person.mustDuty || [] } // ◀ "꼭 당직" 하이라이트 추가
                  ];
                  return(
                  <div key={person.id} className="person-unavailable-picker">
                    <p className="person-name-label">{person.name}</p>
                    <div className="selected-dates-info">
                      {person.unavailable && person.unavailable.length > 0 ? (
                        <>
                          {t('selectedUnavailableDatesPrefix')}
                          <span className="unavailable-dates-text">
                            {person.unavailable.map(date => date.toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })).join(', ')}
                          </span>
                        </>
                      ) : (
                        <span className="no-dates-text">{t('noUnavailableDates')}</span>
                      )}
                      {person.mustDuty && person.mustDuty.length > 0 && (
                        <div className="selected-dates-info">
                          {t('selectedMustDutyDatesPrefix')} 
                          <span className="must-duty-dates-text"> 
                            {person.mustDuty.map(date => date.toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })).join(', ')}
                          </span>
                        </div>
                      )}

                    </div>
                    <DatePicker
                      selected={null}
                      onChange={(date) => {
                        if (!date) return;
                        handlePersonDateChange(person.id, date);
                      }}                 
                      highlightDates={personHighlightConfig} 
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
          {loading ? (
            <button onClick={handleCancelRequest} className="cancel-button">
              <span className="spinner">⏳ </span>
              {t('buttons.cancelGeneration', '생성 중단')} 
            </button>
          ) : (
            <button
              ref={generateButtonRef} 
              onClick={handleGenerateSchedule}
              disabled={!startDate || !endDate || people.length === 0} // loading 조건 제거
              className="generate-button"
            >
              🚀 {t('generateButton')}
            </button>
          )}
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
                      {t('summaryWeekday')}: {item.weekdayDuties}, {t('summaryWeekendOrHoliday')}: {item.weekendOrHolidayDuties} ({t('summaryTotal')}: {item.weekdayDuties + item.weekendOrHolidayDuties})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="buttons-container" style={{ marginTop: '25px', marginBottom: '20px', textAlign: 'center' }}>
              {loading && scheduleResult ? ( // scheduleResult가 있을 때만 "생성 중단" 표시 (생성 중 다른 작업 방지)
                                            // 또는 scheduleResult 조건 없이 loading만 봐도 됨
                <button onClick={handleCancelRequest} className="cancel-button">
                  <span className="spinner">⏳</span>
                  {t('buttons.cancelGeneration', '생성 중단')}
                </button>
              ) : (
                <button
                  onClick={handleGenerateSchedule} // "다시 만들기"도 동일한 생성 함수 호출
                  disabled={!startDate || !endDate || people.length === 0} // loading 조건 제거
                  className="generate-button" 
                >
                  {t('remakeButtonLabel')}
                </button>
              )}
              {/* 다운로드 버튼은 로딩 중 비활성화 또는 그대로 유지 */}
              {scheduleResult && (
                <button
                  onClick={handleDownloadImage}
                  disabled={loading} // 로딩 중에는 다운로드 비활성화
                  className="download-button"
                  style={{ marginLeft: '10px' }}
                >
                  {loading ? t('common.downloading', '처리 중...') : '💾 Download'}
                </button>
              )}
            </div>

          </div>
        )}
        
        <div className="app-store-links-container" 
          style={{ 
            textAlign: 'center', 
            padding: '30px 20px', 
            marginTop: '40px', 
            borderTop: '1px solid #eee' 
          }}>
          <h3 style={{ marginBottom: '10px' }}>{t('BetaVersion')}</h3>
          <p style={{ marginBottom: '20px', fontSize: '0.95em', color: '#444' }}>
            {t('BetaVersionDescription')}
          </p>
        </div>

        {/* <div className="app-store-links-container" 
          style={{ 
            textAlign: 'center', 
            padding: '30px 20px', 
            marginTop: '40px', 
            borderTop: '1px solid #eee' 
          }}>
          <h3 style={{ marginBottom: '10px' }}>{t('getApp.title', '"더 길게, 더 많은 사람" 기능을 원하신다면... 유료앱으로! (서버가 힘들어해요...)')}</h3>
          <p style={{ marginBottom: '20px', fontSize: '0.95em', color: '#444' }}>
            {t('getApp.description', '당신의 $0.99 후원은 훗날 자라서 튼튼한 서버가 됩니다')}
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
    </>
  );
}

export default App;