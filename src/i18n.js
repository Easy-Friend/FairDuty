// src/i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi) // public/locales 폴더에서 번역 파일을 불러옵니다.
  .use(LanguageDetector) // 사용자의 브라우저 언어를 감지합니다.
  .use(initReactI18next) // i18n 인스턴스를 react-i18next에 전달합니다.
  .init({
    supportedLngs: ['ko', 'en', 'zh', 'ja', 'es', 'pt', 'hi'], // 지원하는 언어 목록
    fallbackLng: 'en', // 감지된 언어가 지원 목록에 없거나 감지 실패 시 사용할 기본 언어
    //lng: 'ko', // 특정 언어로 고정하고 싶을 때 (테스트용)
    debug: process.env.NODE_ENV === 'development', // 개발 환경에서만 디버그 로그 출력

    // LanguageDetector 설정
    detection: {
      // 언어 감지 순서: localStorage -> cookie -> navigator (브라우저 설정) -> htmlTag
      order: ['localStorage', 'cookie', 'navigator', 'htmlTag'],
      caches: ['localStorage', 'cookie'], // 감지된 언어를 저장할 위치
    },

    // HttpApi (번역 파일 로더) 설정
    backend: {
      loadPath: '/locales/{{lng}}/translation.json', // 번역 파일 경로
    },

    // react-i18next 기본 설정
    react: {
      useSuspense: true, // true로 하면 번역 로딩 중 Suspense 사용 (지금은 false로 단순하게)
    },
  });

export default i18n;