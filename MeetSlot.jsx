import React, { useState, useMemo, useRef, useEffect } from "react";

// ════════════════════════════════════════════════════════════════════
//  MeetSlot — 회의 일정 조율 (토스 디자인)
//  핵심 명제: "비어 있음" ≠ "확정해도 괜찮음"
//  v3: 추천 행동 / SVG 아이콘 / 5일 한 화면 / 위계 정리
// ════════════════════════════════════════════════════════════════════

// ── 날짜 시스템 ──
// 오늘 = 2026년 7월 13일 (월). 이번 주 = 7/13(월)~17(금).
const TODAY = new Date(2026, 6, 13); // 월 0-indexed → 6 = 7월
const NOW_MIN = 9 * 60 + 41; // 데모 기준 현재 시각(헤더 09:41) — 오늘 지난 시간은 추천/hover 제외
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri"];
const DAY_LABELS = ["월", "화", "수", "목", "금"];
const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// 주어진 날짜가 속한 주의 월요일
function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0=일,1=월,...
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}
// 월요일 기준으로 월~금 DAYS 생성. 각 날에 date/dateObj/isPast 포함.
function buildDays(monday) {
  return DAY_KEYS.map((key, i) => {
    const dateObj = addDays(monday, i);
    return {
      key, label: DAY_LABELS[i], date: dateObj.getDate(),
      dateObj, isPast: ymd(dateObj) < ymd(TODAY),
    };
  });
}
// 영업시간 10:00~17:00, 30분 슬롯. 시간은 분 단위.
// 근무시간(후보 계산 범위): 이 안에서만 회의 후보를 만든다(야간 후보 방지)
const BIZ_START = 9 * 60, BIZ_END = 18 * 60, SLOT = 30;
const SLOTS = [];
for (let t = BIZ_START; t < BIZ_END; t += SLOT) SLOTS.push(t);
// 표시 범위(달력 축/스크롤): 자정~24시 풀데이. 기본 스크롤은 10시로 맞춘다.
const DAY_START = 0, DAY_END = 24 * 60, DEFAULT_SCROLL_MIN = 8 * 60 + 30;
const DAY_SLOTS = [];
for (let t = DAY_START; t < DAY_END; t += SLOT) DAY_SLOTS.push(t);
// 회의 길이 옵션 (분)
const DURATIONS = [30, 60, 90, 120];
const SLOT_PX = 26; // 30분 슬롯의 픽셀 높이 (블록 레이아웃 기준)
const TOP_PAD = 14; // 달력 본문 상단 여백 (자정 라벨 생략 → 빈 자정 시간이 "한 시간 스킵" 역할)
function fmtDur(m) { const h = Math.floor(m/60), mm = m%60; return [h?`${h}시간`:"", mm?`${mm}분`:""].filter(Boolean).join(" "); }
function fmtDurChip(m) { const h = Math.floor(m/60), mm = m%60; if (h && mm === 30) return `${h}시간반`; if (h && mm) return `${h}시간${mm}`; if (h) return `${h}시간`; return `${mm}분`; }
function slotLabel(min) { const h = Math.floor(min/60), m = min%60; const ap = h<12?"오전":"오후"; let hh=h%12; if(hh===0)hh=12; return `${ap} ${hh}:${String(m).padStart(2,"0")}`; }
function axisLabel(min) { const h = Math.floor(min/60); const ap = h<12?"오전":"오후"; let hh=h%12; if(hh===0)hh=12; return `${ap} ${hh}:00`; }
// 날짜 라벨: "7월 13일 월요일" (월 + 일 + 전체 요일)
function fullDateLabel(d) { return d ? `${d.dateObj.getMonth() + 1}월 ${d.date}일 (${d.label})` : ""; }
// 시간 범위(짧게): 시작·끝이 같은 오전/오후면 끝엔 오전/오후 생략 → "오후 5:00–6:00"
function slotRangeShort(start, end) {
  const sAp = Math.floor(start / 60) < 12 ? "오전" : "오후";
  const eAp = Math.floor(end / 60) < 12 ? "오전" : "오후";
  let eh = Math.floor(end / 60) % 12; if (eh === 0) eh = 12;
  const endStr = eAp === sAp ? `${eh}:${String(end % 60).padStart(2, "0")}` : slotLabel(end);
  return `${slotLabel(start)}–${endStr}`;
}

// 기간 표시 라벨
function dateRangeLabel(days) {
  if (!days || days.length === 0) return "";
  const first = days[0].dateObj, last = days[days.length - 1].dateObj;
  if (days.length === 1) {
    return `${first.getMonth() + 1}월 ${first.getDate()}일 (${WEEKDAY_KR[first.getDay()]})`;
  }
  const firstW = WEEKDAY_KR[first.getDay()], lastW = WEEKDAY_KR[last.getDay()];
  const lastPart = last.getMonth() !== first.getMonth() ? `${last.getMonth() + 1}월 ${last.getDate()}일 (${lastW})` : `${last.getDate()}일 (${lastW})`;
  return `${first.getMonth() + 1}월 ${first.getDate()}일 (${firstW}) – ${lastPart}`;
}

const ME_ID = "me"; // 현재 로그인 사용자(나)
const EMPLOYEES = [
  { id: "me", name: "김도현", dept: "프로덕트", role: "PM", team: "코어", photo: "/avatars/m1.jpg" },
  { id: "u1", name: "이가영", dept: "세일즈", role: "AE", team: "엔터프라이즈", photo: "/avatars/f1.jpg" },
  { id: "u2", name: "윤지은", dept: "디자인", role: "프로덕트 디자이너", team: "코어", photo: "/avatars/f2.jpg" },
  { id: "u3", name: "정지훈", dept: "프로덕트", role: "프로덕트 총괄", team: "코어", photo: "/avatars/m2.jpg" },
  { id: "u4", name: "박하린", dept: "엔지니어링", role: "BE 개발", team: "플랫폼", photo: "/avatars/f3.jpg" },
  { id: "u5", name: "박은주", dept: "디자인", role: "프로덕트 디자이너", team: "코어", photo: "/avatars/f4.jpg" },
  { id: "u6", name: "최민재", dept: "엔지니어링", role: "BE 개발", team: "플랫폼", photo: "/avatars/m3.jpg" },
  { id: "u7", name: "한수아", dept: "프로덕트", role: "데이터 분석", team: "그로스", photo: "/avatars/f5.jpg" },
  { id: "u8", name: "김준호", dept: "세일즈", role: "AE", team: "엔터프라이즈", photo: "/avatars/m4.jpg" },
  { id: "u9", name: "조예린", dept: "디자인", role: "UX 리서처", team: "코어", photo: "/avatars/f6.jpg" },
  { id: "u10", name: "오태경", dept: "엔지니어링", role: "QA", team: "플랫폼", photo: "/avatars/m5.jpg" },
  { id: "u11", name: "임현우", dept: "마케팅", role: "브랜드", team: "콘텐츠", photo: "/avatars/m6.jpg" },
  { id: "u12", name: "신보검", dept: "세일즈", role: "SDR", team: "엔터프라이즈", photo: "/avatars/m7.jpg" },
  { id: "u13", name: "강도윤", dept: "엔지니어링", role: "인프라", team: "플랫폼", photo: "/avatars/m8.jpg" },
  { id: "u14", name: "서지우", dept: "프로덕트", role: "PM", team: "그로스", photo: "/avatars/f7.jpg" },
  { id: "u15", name: "문채원", dept: "디자인", role: "BX 디자이너", team: "브랜드", photo: "/avatars/f8.jpg" },
  { id: "u16", name: "배준서", dept: "세일즈", role: "AM", team: "엔터프라이즈", photo: "/avatars/m9.jpg" },
  { id: "u17", name: "홍서연", dept: "마케팅", role: "퍼포먼스", team: "CRM", photo: "/avatars/f9.jpg" },
  { id: "u18", name: "곽민준", dept: "엔지니어링", role: "FE 개발", team: "코어", photo: "/avatars/m10.jpg" },
  { id: "u19", name: "남유진", dept: "프로덕트", role: "데이터 분석", team: "그로스", photo: "/avatars/f10.jpg" },
  { id: "u20", name: "천예은", dept: "디자인", role: "프로덕트 디자이너", team: "플랫폼", photo: "/avatars/f11.jpg" },
  { id: "u21", name: "구본우", dept: "엔지니어링", role: "BE 개발", team: "플랫폼", photo: "/avatars/m11.jpg" },
  { id: "u22", name: "양지호", dept: "세일즈", role: "AE", team: "엔터프라이즈", photo: "/avatars/m12.jpg" },
  { id: "u23", name: "심하은", dept: "마케팅", role: "콘텐츠", team: "콘텐츠", photo: "/avatars/f12.jpg" },
  { id: "u24", name: "노건우", dept: "엔지니어링", role: "ML", team: "데이터", photo: "/avatars/m13.jpg" },
  { id: "u25", name: "진서아", dept: "프로덕트", role: "PO", team: "코어", photo: "/avatars/f13.jpg" },
  { id: "u26", name: "방태현", dept: "디자인", role: "UX 라이터", team: "코어", photo: "/avatars/m14.jpg" },
  { id: "u27", name: "유채린", dept: "세일즈", role: "SDR", team: "엔터프라이즈", photo: "/avatars/f14.jpg" },
  { id: "u28", name: "하도경", dept: "엔지니어링", role: "QA", team: "플랫폼", photo: "/avatars/m15.jpg" },
  { id: "u29", name: "백승호", dept: "마케팅", role: "그로스", team: "CRM", photo: "/avatars/m16.jpg" },
  { id: "u30", name: "전소미", dept: "프로덕트", role: "PM", team: "코어", photo: "/avatars/f15.jpg" },
];

const SCHEDULES = {
  // 근무시간 9~18시. 하루를 촘촘히 채우되 공통으로 비는 창을 남겨 후보가 뜨게 함.
  // 9시 전·18시 이후엔 회사라 전체에서 딱 2개(u3 새벽 배포, u6 야간 온콜)만.
  // 김도현 (PM) — 적당히 바쁨. 6명 공통 빈 슬롯은 월10·수13·금11만 남게 설계. 회피 15~16.
  me: [{ day: "mon", start: 660, end: 720, title: "1:1 미팅" }, { day: "mon", start: 780, end: 900, title: "제품 리뷰" }, { day: "mon", start: 960, end: 1080, title: "디자인 싱크" }, { day: "wed", start: 960, end: 1080, title: "고객사 미팅" }, { day: "fri", start: 780, end: 840, title: "발표 준비" }],
  // 이가영 (Sales)
  u1: [{ day: "mon", start: 960, end: 1080, title: "고객사 방문" }, { day: "tue", start: 660, end: 720, title: "제품 데모" }, { day: "tue", start: 780, end: 840, title: "계약 협의" }, { day: "thu", start: 600, end: 720, title: "고객 미팅" }],
  // 윤지은 (Product Designer) — 회피 13~15.
  u2: [{ day: "tue", start: 960, end: 1080, title: "집중 업무" }, { day: "wed", start: 600, end: 720, title: "디자인 워크숍" }, { day: "fri", start: 960, end: 1080, title: "디자인 리뷰" }],
  // 정지훈 (Head of Product) — 오전 회피 9~10.
  u3: [{ day: "thu", start: 780, end: 840, title: "채용 인터뷰" }, { day: "thu", start: 1020, end: 1080, title: "저녁 브리핑" }, { day: "fri", start: 600, end: 660, title: "경영진 회의" }],
  // 박하린 (Backend, 선택) — 회의 최소, 집중 15~17 회피.
  u4: [{ day: "mon", start: 780, end: 840, title: "코드 리뷰" }, { day: "tue", start: 840, end: 900, title: "API 설계 리뷰" }],
  // 박은주 (Product Designer, 선택) — 회의 가볍게, 14~17 회피.
  u5: [{ day: "tue", start: 660, end: 690, title: "디자인 QA" }, { day: "fri", start: 840, end: 960, title: "시안 작업" }],
  // 최민재 (BE) — 코드리뷰·배포, 목 야간 배포
  u6: [{ day: "mon", start: 660, end: 720, title: "코드 리뷰" }, { day: "tue", start: 360, end: 420, title: "새벽 배포" }, { day: "tue", start: 840, end: 900, title: "API 설계 리뷰" }, { day: "wed", start: 810, end: 870, title: "코드 리뷰" }, { day: "thu", start: 600, end: 630, title: "스프린트 리뷰" }, { day: "thu", start: 1320, end: 1380, title: "야간 배포" }, { day: "fri", start: 900, end: 960, title: "코드 리뷰" }],
  // 한수아 (데이터 분석) — 지표·실험, 금 문서 작업
  u7: [{ day: "mon", start: 600, end: 660, title: "지표 리뷰" }, { day: "mon", start: 840, end: 900, title: "실험 분석" }, { day: "tue", start: 660, end: 690, title: "대시보드 점검" }, { day: "wed", start: 630, end: 690, title: "AB 테스트 리뷰" }, { day: "wed", start: 960, end: 1080, title: "데이터 워크숍" }, { day: "thu", start: 570, end: 600, title: "주간 지표" }, { day: "fri", start: 780, end: 900, title: "문서 작업" }],
  // 김준호 (Sales AE) — 화 종일 외근, 목 저녁 회식
  u8: [{ day: "mon", start: 600, end: 660, title: "고객 미팅" }, { day: "mon", start: 900, end: 960, title: "딜 리뷰" }, { day: "tue", start: 540, end: 1080, title: "고객사 방문" }, { day: "wed", start: 660, end: 720, title: "제품 데모" }, { day: "wed", start: 960, end: 1020, title: "계약 협의" }, { day: "thu", start: 840, end: 900, title: "고객 온보딩" }, { day: "thu", start: 1140, end: 1260, title: "고객사 회식" }, { day: "fri", start: 600, end: 660, title: "QBR" }],
  // 조예린 (UX 리서처) — 인터뷰 위주, 목 연차
  u9: [{ day: "mon", start: 840, end: 930, title: "사용자 인터뷰" }, { day: "tue", start: 660, end: 690, title: "리서치 싱크" }, { day: "wed", start: 600, end: 690, title: "사용자 인터뷰" }, { day: "thu", start: 540, end: 1080, title: "연차" }, { day: "fri", start: 780, end: 840, title: "리서치 리포트" }],
  // 오태경 (QA) — 테스트, 수 집중(일정 없음)
  u10: [{ day: "mon", start: 570, end: 600, title: "QA 싱크" }, { day: "mon", start: 900, end: 990, title: "회귀 테스트" }, { day: "tue", start: 960, end: 1020, title: "릴리즈 점검" }, { day: "tue", start: 1290, end: 1350, title: "야간 릴리즈 점검" }, { day: "thu", start: 660, end: 720, title: "버그 리뷰" }, { day: "fri", start: 840, end: 900, title: "QA 회고" }],
  // 임현우 (브랜드) — 리뷰·촬영 현장(외부)
  u11: [{ day: "mon", start: 660, end: 720, title: "브랜드 리뷰" }, { day: "tue", start: 840, end: 900, title: "캠페인 킥오프" }, { day: "tue", start: 930, end: 1080, title: "촬영 현장" }, { day: "wed", start: 600, end: 660, title: "콘텐츠 리뷰" }, { day: "thu", start: 780, end: 900, title: "브랜드 워크숍" }, { day: "fri", start: 960, end: 1050, title: "발표 준비" }],
  // 신보검 (Sales SDR) — 목 종일 외부 세미나
  u12: [{ day: "mon", start: 600, end: 660, title: "콜드콜 블록" }, { day: "tue", start: 780, end: 1020, title: "고객사 방문" }, { day: "wed", start: 660, end: 690, title: "제품 데모" }, { day: "thu", start: 540, end: 1080, title: "외부 세미나" }, { day: "fri", start: 900, end: 960, title: "파이프라인 점검" }],
  // 강도윤 (인프라) — 이른 점검·금 야간 점검
  u13: [{ day: "mon", start: 360, end: 420, title: "서비스 점검" }, { day: "mon", start: 1020, end: 1050, title: "온콜 인수" }, { day: "tue", start: 660, end: 690, title: "배포 점검" }, { day: "wed", start: 330, end: 390, title: "온콜 장애 대응" }, { day: "wed", start: 840, end: 930, title: "장애 대응 훈련" }, { day: "thu", start: 960, end: 990, title: "인프라 리뷰" }, { day: "fri", start: 1320, end: 1410, title: "야간 점검" }],
  // 서지우 (PM) — 회의 많음
  u14: [{ day: "mon", start: 570, end: 630, title: "주간 스프린트 계획" }, { day: "mon", start: 840, end: 870, title: "PO Sync" }, { day: "tue", start: 660, end: 720, title: "백로그 정리" }, { day: "tue", start: 960, end: 1020, title: "분기 로드맵 리뷰" }, { day: "wed", start: 600, end: 660, title: "우선순위 회의" }, { day: "thu", start: 780, end: 840, title: "고객 인터뷰" }, { day: "thu", start: 990, end: 1020, title: "1:1 미팅" }, { day: "fri", start: 660, end: 720, title: "회고" }],
  // 문채원 (BX 디자이너) — 오후 작업 몰입, 금 병원
  u15: [{ day: "mon", start: 600, end: 660, title: "BX 리뷰" }, { day: "tue", start: 840, end: 960, title: "브랜드 가이드 작업" }, { day: "wed", start: 660, end: 690, title: "디자인 QA" }, { day: "thu", start: 900, end: 960, title: "시안 리뷰" }, { day: "fri", start: 540, end: 600, title: "병원" }, { day: "fri", start: 840, end: 900, title: "디자인 리뷰" }],
  // 배준서 (Sales AM) — 수 종일 외근, 금 출장 이동
  u16: [{ day: "mon", start: 660, end: 720, title: "계정 리뷰" }, { day: "tue", start: 600, end: 660, title: "고객 미팅" }, { day: "tue", start: 900, end: 960, title: "QBR" }, { day: "wed", start: 540, end: 1080, title: "고객사 방문" }, { day: "thu", start: 840, end: 900, title: "갱신 협의" }, { day: "fri", start: 630, end: 690, title: "고객 미팅" }, { day: "fri", start: 960, end: 1080, title: "출장 이동" }],
  // 홍서연 (퍼포먼스) — 성과·광고
  u17: [{ day: "mon", start: 600, end: 660, title: "퍼포먼스 리뷰" }, { day: "mon", start: 960, end: 990, title: "캠페인 점검" }, { day: "tue", start: 660, end: 720, title: "광고 최적화" }, { day: "wed", start: 840, end: 900, title: "성과 분석" }, { day: "thu", start: 600, end: 630, title: "그로스 위클리" }, { day: "fri", start: 780, end: 870, title: "문서 작업" }],
  // 곽민준 (FE) — 수 집중(일정 없음)
  u18: [{ day: "mon", start: 840, end: 900, title: "코드 리뷰" }, { day: "tue", start: 660, end: 690, title: "FE 싱크" }, { day: "thu", start: 600, end: 630, title: "스프린트 리뷰" }, { day: "thu", start: 900, end: 960, title: "코드 리뷰" }, { day: "fri", start: 960, end: 990, title: "배포 점검" }],
  // 남유진 (데이터 분석) — 지표·실험
  u19: [{ day: "mon", start: 660, end: 720, title: "지표 회의" }, { day: "tue", start: 600, end: 630, title: "대시보드 리뷰" }, { day: "tue", start: 900, end: 960, title: "실험 설계" }, { day: "wed", start: 660, end: 690, title: "분석 동기화" }, { day: "thu", start: 780, end: 900, title: "데이터 워크숍" }, { day: "fri", start: 570, end: 600, title: "주간 지표" }],
  // 천예은 (프로덕트 디자이너) — 수 종일 워크숍(외부), 금 저녁 PT
  u20: [{ day: "mon", start: 630, end: 690, title: "디자인 리뷰" }, { day: "tue", start: 900, end: 960, title: "프로토타입 리뷰" }, { day: "wed", start: 540, end: 1080, title: "디자인 워크숍" }, { day: "thu", start: 660, end: 690, title: "디자인 QA" }, { day: "fri", start: 840, end: 870, title: "핸드오프 싱크" }, { day: "fri", start: 1140, end: 1200, title: "헬스 PT" }],
  // 구본우 (BE) — 회의 최소(화·금 일정 없음)
  u21: [{ day: "mon", start: 780, end: 840, title: "코드 리뷰" }, { day: "wed", start: 900, end: 960, title: "API 설계 리뷰" }, { day: "thu", start: 600, end: 630, title: "스프린트 리뷰" }],
  // 양지호 (Sales AE) — 금 종일 외근
  u22: [{ day: "mon", start: 660, end: 720, title: "딜 리뷰" }, { day: "mon", start: 960, end: 1020, title: "고객 미팅" }, { day: "tue", start: 840, end: 900, title: "제품 데모" }, { day: "wed", start: 600, end: 660, title: "고객 온보딩" }, { day: "thu", start: 900, end: 960, title: "QBR" }, { day: "fri", start: 540, end: 1080, title: "고객사 방문" }],
  // 심하은 (콘텐츠) — 목 연차
  u23: [{ day: "mon", start: 660, end: 720, title: "콘텐츠 리뷰" }, { day: "tue", start: 600, end: 630, title: "편집 회의" }, { day: "tue", start: 840, end: 960, title: "문서 작업" }, { day: "wed", start: 900, end: 960, title: "콘텐츠 기획" }, { day: "thu", start: 540, end: 1080, title: "연차" }, { day: "fri", start: 600, end: 630, title: "발행 점검" }],
  // 노건우 (ML) — 이른 학습 모니터링, 목 집중(일정 없음)
  u24: [{ day: "mon", start: 840, end: 900, title: "모델 리뷰" }, { day: "tue", start: 660, end: 690, title: "ML 싱크" }, { day: "wed", start: 360, end: 420, title: "새벽 학습 모니터링" }, { day: "fri", start: 960, end: 1050, title: "논문 세미나" }],
  // 진서아 (PO) — 회의
  u25: [{ day: "mon", start: 570, end: 600, title: "데일리" }, { day: "mon", start: 900, end: 960, title: "스프린트 리뷰" }, { day: "tue", start: 660, end: 720, title: "백로그 그루밍" }, { day: "wed", start: 840, end: 900, title: "기획 회의" }, { day: "wed", start: 990, end: 1020, title: "1:1 미팅" }, { day: "thu", start: 600, end: 630, title: "팀 싱크" }, { day: "fri", start: 780, end: 840, title: "회고" }],
  // 방태현 (UX 라이터) — 오후 문서 작업 몰입
  u26: [{ day: "mon", start: 660, end: 690, title: "UX 라이팅 리뷰" }, { day: "tue", start: 840, end: 960, title: "문서 작업" }, { day: "wed", start: 600, end: 630, title: "콘텐츠 싱크" }, { day: "thu", start: 900, end: 930, title: "디자인 리뷰" }, { day: "fri", start: 660, end: 690, title: "카피 리뷰" }],
  // 유채린 (Sales SDR) — 월 종일 외부 컨퍼런스
  u27: [{ day: "mon", start: 540, end: 1080, title: "외부 컨퍼런스" }, { day: "tue", start: 600, end: 660, title: "콜드콜 블록" }, { day: "wed", start: 900, end: 960, title: "고객 미팅" }, { day: "thu", start: 660, end: 690, title: "파이프라인 점검" }, { day: "fri", start: 840, end: 870, title: "제품 데모" }],
  // 하도경 (QA) — 테스트
  u28: [{ day: "mon", start: 600, end: 690, title: "회귀 테스트" }, { day: "tue", start: 570, end: 600, title: "QA 싱크" }, { day: "tue", start: 900, end: 960, title: "버그 리뷰" }, { day: "wed", start: 960, end: 1020, title: "릴리즈 점검" }, { day: "thu", start: 360, end: 420, title: "새벽 시스템 점검" }, { day: "thu", start: 780, end: 870, title: "테스트 자동화" }, { day: "fri", start: 660, end: 720, title: "QA 회고" }],
  // 백승호 (그로스) — 금 일정 없음
  u29: [{ day: "mon", start: 600, end: 660, title: "그로스 위클리" }, { day: "tue", start: 840, end: 900, title: "실험 리뷰" }, { day: "wed", start: 660, end: 720, title: "퍼널 분석" }, { day: "wed", start: 990, end: 1050, title: "캠페인 점검" }, { day: "thu", start: 600, end: 630, title: "그로스 싱크" }],
  // 전소미 (PM) — 회의
  u30: [{ day: "mon", start: 600, end: 660, title: "주간 스프린트 계획" }, { day: "mon", start: 840, end: 900, title: "고객사 리뷰" }, { day: "tue", start: 660, end: 690, title: "PO Sync" }, { day: "wed", start: 600, end: 720, title: "분기 로드맵 리뷰" }, { day: "thu", start: 900, end: 930, title: "1:1 미팅" }, { day: "thu", start: 960, end: 1020, title: "신규 입사자 온보딩" }, { day: "fri", start: 660, end: 720, title: "회고" }],
};

// avoid: 회의를 피하고 싶은/집중 시간대 (소프트 — "확인 필요"로 뜸). 분 단위.
const CONSTRAINTS = {
  me: { avoid: [{ start: 900, end: 960 }] },                                // 김도현 회피 15:00~16:00
  u3: { avoid: [{ start: 540, end: 600 }] },                                // 정지훈 오전 집중 9~10
  u5: { avoid: [{ start: 840, end: 900 }] },                                // 박은주 오후 시안 작업 14~15
  u7: { avoid: [{ start: 840, end: 960 }] },                                // 한수아 분석 집중 14~16
  u18: { avoid: [{ start: 600, end: 720 }] },                               // 곽민준 개발 집중 10~12
  u24: { avoid: [{ start: 780, end: 960 }] },                               // 노건우 모델 학습 집중 13~16
};

const H = (h, m = 0) => h * 60 + m;
const ROOM_LOCK = [
  // 요일별 오후 1시간 잠금만 → "회의실 없음" 데모(캘린더에 빨간 블록으로 표시됨). 점심 상시 잠금은 빈칸 클릭 시 혼란 유발해 제거.
  { day: "mon", start: H(15), end: H(16) }, { day: "tue", start: H(10), end: H(11) }, { day: "wed", start: H(15), end: H(16) }, { day: "thu", start: H(16), end: H(17) }, { day: "fri", start: H(14), end: H(15) },
];
const ROOMS = [
  { id: "r1", name: "미팅룸 1", capacity: 4, floor: "지하1층", img: "/rooms/room1.jpg", busy: [...ROOM_LOCK] },
  { id: "r2", name: "미팅룸 2", capacity: 6, floor: "지하1층", img: "/rooms/room2.jpg", busy: [...ROOM_LOCK, { day: "tue", start: H(15), end: H(16) }, { day: "fri", start: H(15), end: H(16) }] },
  { id: "r3", name: "미팅룸 3", capacity: 8, floor: "1층", img: "/rooms/room3.jpg", busy: [...ROOM_LOCK] },
  { id: "r4", name: "미팅룸 4", capacity: 8, floor: "3층", img: "/rooms/room4.jpg", busy: [...ROOM_LOCK, { day: "tue", start: H(15), end: H(16) }, { day: "fri", start: H(15), end: H(16) }] },
  { id: "r5", name: "미팅룸 5", capacity: 6, floor: "3층", img: "/rooms/room5.jpg", busy: [...ROOM_LOCK] },
  { id: "r6", name: "미팅룸 6", capacity: 10, floor: "4층", img: "/rooms/room6.jpg", busy: [...ROOM_LOCK] },
];

const byId = (id) => EMPLOYEES.find((e) => e.id === id);
const nameOf = (id) => byId(id)?.name || id;
// 화면 표시용 이름: 나면 "(나)" 붙임 (로직/사유 텍스트엔 nameOf 사용)
const displayName = (id) => (id === ME_ID ? `${nameOf(id)} (나)` : nameOf(id));
const initialOf = (id) => nameOf(id).charAt(0);
// 이름 목록 → "가영, 지은" / 4명 이상은 "가영 외 3명"
function namesLabel(ids) {
  const arr = ids.map(nameOf);
  if (arr.length <= 3) return arr.join(", ");
  return `${arr[0]} 외 ${arr.length - 1}명`;
}
const DEPTS = ["프로덕트", "엔지니어링", "디자인", "마케팅", "세일즈"];

// 구간 겹침
const overlaps = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;


// 참석자가 [start,end) 구간에 일정이 있나
function personBusy(id, day, start, end) {
  return (SCHEDULES[id] || []).some((e) => e.day === day && overlaps(start, end, e.start, e.end));
}
// 그 구간에 걸치는 일정 하나 반환(표시용)
function eventOverlapping(id, day, start, end) {
  return (SCHEDULES[id] || []).find((e) => e.day === day && overlaps(start, end, e.start, e.end));
}
function roomsFreeAt(day, start, end, size) {
  const free = ROOMS.filter((r) => r.capacity >= size && !r.busy.some((b) => b.day === day && overlaps(start, end, b.start, b.end)));
  if (free.length <= 1) return free; // 0개=회의실없음, 1개는 그대로
  // 전부 가능한 느낌 방지: 슬롯별로 1~4개만 노출(결정적)
  const n = 1 + ((Math.floor(start / 30) + (day.charCodeAt(1) || 0)) % 4);
  return free.slice(0, Math.min(n, free.length));
}

// day의 start부터 durMin 회의를 평가. end가 영업시간 초과면 null.
function evaluateCandidate(day, start, durMin, participants, options) {
  const end = start + durMin;
  if (end > DAY_END) return null; // 그날(자정) 안에 안 들어감 — 근무시간 밖도 평가는 가능(정보카드용)

  const busyRequired = [], busyOptional = [], prefConflicts = [], fieldwork = [];
  for (const p of participants) {
    if (personBusy(p.id, day, start, end)) (p.required ? busyRequired : busyOptional).push(p.id);
    const c = CONSTRAINTS[p.id];
    if (c) {
      // 회피/집중 시간대에 회의 구간이 걸치면 (소프트 → 확인 필요)
      if (c.avoid) { for (const a of c.avoid) { if (overlaps(start, end, a.start, a.end)) { prefConflicts.push(p.id); break; } } }
      if (c.fieldworkDays && c.fieldworkDays.includes(day)) fieldwork.push(p.id);
    }
  }
  const roomsFree = options && options.online ? [{ id: "online", name: "온라인", capacity: 99, feature: "화상 회의", featureType: "video", floor: null }] : roomsFreeAt(day, start, end, participants.length);
  const base = { busyRequired, busyOptional, prefConflicts, fieldwork, roomsFree, reasons: [], start, end };

  if (busyRequired.length > 0) {
    return { ...base, status: "unfit", reasons: [`필수 참석자 ${busyRequired.map(nameOf).join(", ")} 일정 겹침`] };
  }

  let status = "ready";
  const reasons = [];
  const prefActive = !(options && options.relaxPref);

  if (busyOptional.length > 0) { status = "check"; reasons.push(`선택 참석자 ${busyOptional.map(nameOf).join(", ")}이 다른 일정과 겹쳐요`); }
  if (prefActive) {
    const prefPeople = [...new Set([...prefConflicts, ...fieldwork])];
    if (prefPeople.length > 0) {
      status = "check";
      reasons.push(`${prefPeople.map(nameOf).join(", ")}님이 이 시간을 회의를 피하고 싶은 시간으로 설정했어요`);
    }
  }
  if (roomsFree.length === 0) { status = "adjust"; reasons.push("이 시간에 쓸 수 있는 회의실이 없어요"); }
  if (status === "ready") {
    reasons.push(options && options.relaxPref ? "선호 조건을 완화해 확정 가능 후보가 됐어요" : "필수 참석자 전원 가능, 충돌 없음, 회의실 있음");
  }
  return { ...base, status, reasons };
}

function countReady(days, durMin, participants, options) {
  let n = 0;
  for (const d of days) {
    if (d.isPast) continue;
    for (const s of SLOTS) {
      const ev = evaluateCandidate(d.key, s, durMin, participants, options);
      if (ev && ev.status === "ready") n++;
    }
  }
  return n;
}

function buildGrid(days, durMin, participants, options) {
  const grid = {};
  const counts = { ready: 0, check: 0, adjust: 0, unfit: 0 };
  for (const d of days) for (const s of SLOTS) {
    let ev = evaluateCandidate(d.key, s, durMin, participants, options);
    if (!ev) ev = { status: "unfit", overflow: true, busyRequired: [], busyOptional: [], prefConflicts: [], fieldwork: [], roomsFree: [], reasons: ["회의 시간이 영업시간을 넘어가요"], start: s, end: s + durMin };
    if (d.isPast) ev = { ...ev, status: "unfit", isPast: true };
    grid[`${d.key}-${s}`] = ev;
    counts[ev.status]++;
  }
  return { grid, counts };
}

function solveCandidate(days, day, start, durMin, participants, options) {
  const ev = evaluateCandidate(day, start, durMin, participants, options);
  if (!ev || ev.status !== "adjust") return null;
  const roomBlocked = !options.online && ev.roomsFree.length === 0;
  if (roomBlocked) {
    const afterHere = evaluateCandidate(day, start, durMin, participants, { ...options, online: true });
    if (afterHere && afterHere.status === "ready") {
      const before = countReady(days, durMin, participants, options);
      const after = countReady(days, durMin, participants, { ...options, online: true });
      return { key: "online", title: "온라인으로 전환하기", desc: "회의실 없이 이 시간에 바로 잡을 수 있어요", totalGain: after - before };
    }
  }
  return null;
}

function findBestAlternative(days, durMin, participants) {
  const required = participants.filter((p) => p.required);
  if (required.length === 0) return null;
  let allFreeExists = false;
  let best = { freeCount: -1, start: null, missing: [], dl: null };
  for (const d of days) {
    if (d.isPast) continue;
    for (const s of SLOTS) {
      if (s + durMin > BIZ_END) continue;
      const free = required.filter((p) => !personBusy(p.id, d.key, s, s + durMin));
      if (free.length === required.length) allFreeExists = true;
      if (free.length > best.freeCount) {
        best = { freeCount: free.length, start: s, dl: d,
          missing: required.filter((p) => personBusy(p.id, d.key, s, s + durMin)).map((p) => p.id) };
      }
    }
  }
  if (allFreeExists || !best.dl) return null;
  const dl = best.dl;
  return { dayKey: dl.key, dayLabel: `${fullDateLabel(dl)}`, start: best.start, freeCount: best.freeCount, total: required.length, missing: best.missing };
}

// 셀에 걸치는 일정들(표시용). 슬롯 [s, s+SLOT) 기준.
function eventsInCell(participants, day, slotStart) {
  const list = [];
  for (const p of participants) {
    const ev = eventOverlapping(p.id, day, slotStart, slotStart + SLOT);
    if (ev) list.push({ title: ev.title, who: nameOf(p.id), start: ev.start, end: ev.end });
  }
  return list;
}

// ── 블록 계산(구글 캘린더식) ──
// 하루의 일정 블록: 같은 시간대에 겹치는 참석자들을 하나로 묶어 요약.
// 슬롯 단위로 "일정 있는 사람 집합"을 구하고, 집합이 같은 연속 슬롯을 병합.
function dayEventBlocks(participants, day) {
  const ids = participants.map((p) => p.id);
  const slotInfo = DAY_SLOTS.map((s) => { // 표시 범위 전체(0~24시)의 일정을 그린다
    const people = [];
    for (const id of ids) {
      const ev = eventOverlapping(id, day, s, s + SLOT);
      if (ev) people.push({ id, title: ev.title });
    }
    return { slot: s, people };
  });
  const blocks = [];
  let cur = null;
  for (const si of slotInfo) {
    const key = si.people.map((p) => p.id).sort().join(",");
    if (si.people.length === 0) { if (cur) { blocks.push(cur); cur = null; } continue; }
    if (cur && cur.key === key) { cur.end = si.slot + SLOT; }
    else { if (cur) blocks.push(cur); cur = { start: si.slot, end: si.slot + SLOT, people: si.people, key }; }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// 하루의 후보 블록: 각 시작 시각마다 "회의 길이"만큼의 후보를 만든 뒤,
// 회의 길이 간격으로 "겹치지 않게" 추린다(같은 창을 30분 민 중복 제거).
// 겹치는 후보 중에선 더 좋은 상태(바로>물어봄>바꿈)를 우선해 하나만 남긴다.
// → 한 시간대에 블록은 최대 1개, 크기는 실제 회의 길이 그대로.
function dayCandidateBlocks(day, durMin, participants, options) {
  const raw = [];
  for (const s of SLOTS) {
    if (s + durMin > BIZ_END) continue; // 색 블록(추천/확인필요/회의실없음)은 근무시간 내에서 끝나는 것만
    const ev = evaluateCandidate(day, s, durMin, participants, options);
    if (!ev || ev.status === "unfit") continue; // 불가는 블록 없음
    raw.push({ status: ev.status, start: s, end: s + durMin });
  }
  const rank = { ready: 0, check: 1, adjust: 2 };
  // 좋은 상태 → 이른 시작 순으로 훑으며, 이미 고른 것과 안 겹치면 채택
  raw.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.start - b.start));
  const picked = [];
  for (const b of raw) {
    if (picked.some((p) => p.start < b.end && b.start < p.end)) continue; // 이미 놓인 블록과 겹치면 skip
    // 더 좋은 상태(가능>확인필요>회의실없음)의 후보와 겹치는 구간이면 표시하지 않음
    // → '가능'한 시간이 '회의실없음' 빨강으로 덮이는 버그 방지
    if (raw.some((o) => rank[o.status] < rank[b.status] && o.start < b.end && b.start < o.end)) continue;
    picked.push(b);
  }
  picked.sort((a, b) => a.start - b.start);
  return picked;
}

// 슬롯 전후 여유(분): 참석자들의 일정 사이 빈 공간이 클수록 큼
function slotBuffer(dayKey, start, end, participants) {
  let before = start - BIZ_START, after = BIZ_END - end;
  for (const p of participants) {
    for (const e of (SCHEDULES[p.id] || [])) {
      if (e.day !== dayKey) continue;
      if (e.end <= start) before = Math.min(before, start - e.end);
      if (e.start >= end) after = Math.min(after, e.start - end);
    }
  }
  return Math.max(0, before) + Math.max(0, after);
}
// 앞/뒤 각각의 여유(분) — "여유로운" 축 판정에 사용(각 30분 이상)
function slotBufferSides(dayKey, start, end, participants) {
  let before = start - BIZ_START, after = BIZ_END - end;
  for (const p of participants) {
    for (const e of (SCHEDULES[p.id] || [])) {
      if (e.day !== dayKey) continue;
      if (e.end <= start) before = Math.min(before, start - e.end);
      if (e.start >= end) after = Math.min(after, e.start - end);
    }
  }
  return { before: Math.max(0, before), after: Math.max(0, after) };
}
// 추천끼리 "붙은 시간"(같은 날 2시간 이내) 배제 → 서로 다른 선택지로만 채움
function pickSeparated(cand, picks) {
  return picks.every((q) => (cand.di !== q.di) || Math.abs(cand.start - q.start) >= 120);
}
// 후보 슬롯을 추천 티어(1~4)로 분류. 필수 겹침(불가)/근무시간 밖/제외 대상은 null.
//  T1: 필수 전원 가능 + 선택 전원 가능 + 회의실 있음
//  T2: 필수 전원 가능 + 선택 일부 확인 필요 + 회의실 있음
//  T3: 필수 전원 가능 + 회의실 없음
//  T4: 필수 일부 확인 필요(회피 시간) + 회의실 있음
function recoTierOf(ev, participants, options) {
  if (!ev || ev.status === "unfit") return null; // 필수 기존 일정 겹침 → 제외
  const reqSet = new Set(participants.filter((p) => p.required).map((p) => p.id));
  const prefActive = !(options && options.relaxPref);
  const prefIds = prefActive ? [...new Set([...ev.prefConflicts, ...ev.fieldwork])] : [];
  const reqPref = prefIds.filter((id) => reqSet.has(id));                 // 필수 참석자 확인 필요(회피)
  const optPref = prefIds.filter((id) => !reqSet.has(id));
  const optIssue = [...new Set([...ev.busyOptional, ...optPref])];        // 선택 참석자 확인 필요(겹침·회피)
  const hasRoom = (options && options.online) || ev.roomsFree.length > 0; // 온라인은 회의실 불필요
  let tier;
  if (reqPref.length === 0 && optIssue.length === 0 && hasRoom) tier = 1;
  else if (reqPref.length === 0 && optIssue.length > 0 && hasRoom) tier = 2;
  else if (reqPref.length === 0 && !hasRoom) tier = 3;
  else if (reqPref.length > 0 && hasRoom) tier = 4;
  else return null;                                                       // 필수 확인 필요 + 회의실 없음 → 제외
  const optTotal = participants.filter((p) => !p.required).length;
  return { tier, reqPref, optIssue, optAvail: optTotal - optIssue.length, roomsN: ev.roomsFree.length, confirmCount: reqPref.length + optIssue.length };
}
// "일정 추천 받기": 우선순위 T1>T2>T3>T4, 동일 티어 내 날짜·시간·확인필요수·선택가능수·회의실수 순. 최대 3개(붙은 시간 배제).
function computeRecos(days, durMin, participants, options) {
  const cands = [];
  days.forEach((d, di) => {
    if (d.isPast) return;
    const isToday = ymd(d.dateObj) === ymd(TODAY);
    for (const s of SLOTS) {
      if (s + durMin > BIZ_END) continue;
      if (isToday && s < NOW_MIN) continue;
      const ev = evaluateCandidate(d.key, s, durMin, participants, options);
      const t = recoTierOf(ev, participants, options);
      if (!t) continue;
      const bs = slotBufferSides(d.key, s, s + durMin, participants);
      cands.push({ dayKey: d.key, di, start: s, end: s + durMin, bufMin: Math.min(bs.before, bs.after), ...t });
    }
  });
  if (!cands.length) return { level: "none", picks: [] };
  // 정렬: 티어 → 날짜 빠른 → 시간 빠른 → 확인필요 적은 → 선택가능 많은 → 회의실 많은
  cands.sort((a, b) => (a.tier - b.tier) || (a.di - b.di) || (a.start - b.start) || (a.confirmCount - b.confirmCount) || (b.optAvail - a.optAvail) || (b.roomsN - a.roomsN));
  // 최대 3개, 서로 붙은 시간(같은 날 2시간 이내) 배제해 다양성 확보
  const picks = [];
  for (const c of cands) {
    if (picks.length >= 3) break;
    if (pickSeparated(c, picks)) picks.push(c);
  }
  // 티어1(전부 가능) 여러 개면 각도별 이유 배정: 첫 픽=가장 빠름, 나머지는 구체 이유
  picks.forEach((p, i) => {
    if (i === 0) { p.kind = "fast"; return; }
    if (p.tier !== 1) { p.kind = "status"; return; }
    // 기본 이유: 회의실 넉넉 > 시간대
    p.kind = (!options.online && p.roomsN >= 3) ? "rooms" : (p.start < 720 ? "morning" : "afternoon");
  });
  // 나머지 가능 픽 중 '앞뒤 양쪽' 여유가 가장 큰 것(30분+)만 '여유' 이유로
  const restReady = picks.slice(1).filter((p) => p.tier === 1).sort((a, b) => b.bufMin - a.bufMin);
  if (restReady[0] && restReady[0].bufMin >= 30) restReady[0].kind = "relaxed";
  return { level: "ok", picks };
}

// ── 토스 디자인 토큰 ──
const T = {
  blue: "#3182F6", blueDark: "#2272EB", blueBg: "#E8F3FF", blueBgSoft: "#F4F8FF",
  ink: "#191F28", gray700: "#4E5968", gray500: "#8B95A1", gray400: "#B0B8C1",
  gray300: "#D1D6DB", gray200: "#E5E8EB", gray100: "#F2F4F6", gray50: "#F9FAFB",
  white: "#FFFFFF", headerBg: "#17171C", green: "#15803D", greenDot: "#22C55E",
};
const STATUS = {
  ready:  { bg: "#E8F3FF", border: "#C9E2FF", text: "#2272EB", solid: "#3182F6", soft: "#F4F8FF" },
  check:  { bg: "#FFF3E0", border: "#FFD9A8", text: "#FB8800", solid: "#FE9800", soft: "#FFF9EF" },
  adjust: { bg: "#FFEEEE", border: "#FEAFB4", text: "#E42939", solid: "#F04452", soft: "#FFF6F6" },
  unfit:  { bg: "#F9FAFB", border: "#E5E8EB", text: "#B0B8C1", solid: "#D1D6DB", soft: "#FAFBFC" },
};
const STATUS_LABEL = { ready: "가능", check: "확인 필요", adjust: "회의실 없음", unfit: "불가" };
// Info Card 태그 색상 (Figma 86:6390 그대로)
const CARD_TAG = {
  ready:  { bg: "#E8F3FF", dot: "#3182F6", text: "#2272EB" },
  check:  { bg: "#FFF3E0", dot: "#FE9800", text: "#FB8800" },
  adjust: { bg: "#FFEEEE", dot: "#F04452", text: "#E42939" },
  unfit:  { bg: "#F2F4F6", dot: "#D1D6DB", text: "#B0B8C1" },
};
const STATUS_SHORT = { ready: "가능", check: "확인 필요", adjust: "회의실 없음", unfit: "불가" };
// 추천 카드 헤드라인 = "왜 이게 좋은지"만. (status × 축)
// 추천 카드 타이틀: 티어별 4종만 사용(상태 기준, '다른 날' 같은 표현 금지)
function recoReason(p) {
  // 상태(티어) 우선 — 확인필요/회의실없음은 상태 타이틀
  if (p.tier === 2) return "일부 참석자 확인이 필요해요";
  if (p.tier === 3) return "회의실만 조정하면 가능해요";
  if (p.tier === 4) return "필수 참석자 확인이 필요해요";
  // 티어1(전부 가능)이 여러 개면 각도별 구체 이유
  if (p.kind === "relaxed") return "앞뒤로 여유로운 시간이에요";
  if (p.kind === "rooms") return "회의실 선택지가 많아요";
  if (p.kind === "morning") return "오전이라 집중하기 좋아요";
  if (p.kind === "afternoon") return "오후에 잡기 좋아요";
  return "가장 빠른 시간이에요";
}
// 추천 카드 보조 설명: 실제 조건을 구체적으로
function recoDesc(p) {
  // 필수 확인 필요(티어4)
  if (p.tier === 4) {
    return p.reqPref.length === 1 ? `${nameOf(p.reqPref[0])} 확인 필요` : `필수 참석자 ${p.reqPref.length}명 확인 필요`;
  }
  // 필수·선택 모두 가능 → "참석자 모두 가능"으로 통일
  if (p.optIssue.length === 0) return "참석자 모두 가능";
  // 필수 전원 가능 + 선택 일부 확인 필요
  const opt = p.optIssue.length === 1 ? `${nameOf(p.optIssue[0])} 확인 필요` : `선택 참석자 ${p.optIssue.length}명 확인 필요`;
  return `필수 참석자 모두 가능 · ${opt}`;
}
// 티어 → 상태색(캘린더 색과 일관): 1=가능, 2·4=확인필요, 3=회의실없음
function tierStatus(tier) { return tier === 1 ? "ready" : tier === 3 ? "adjust" : "check"; }
const COUNT_BUN = ["", "한 분", "두 분", "세 분", "네 분", "다섯 분", "여섯 분", "일곱 분", "여덟 분"];
const STATUS_HINT = {
  ready: "지금 바로 확정할 수 있어요",
  check: "확인이 필요한 참석자가 있어요",
  adjust: "온라인으로 전환하면 잡을 수 있어요",
  unfit: "필수 참석자가 다른 일정과 겹쳐 잡을 수 없어요",
};
const AVATAR_COLORS = ["#FFE2E5", "#E3F0FF", "#E5F8EE", "#FFF1D6", "#EFE7FF", "#DDF4F4", "#FFE8D6", "#E8EAF6"];
function avatarColor(id) {
  const idx = EMPLOYEES.findIndex((e) => e.id === id);
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}
// 사진(photo)이 있으면 사진, 없으면(또는 로드 실패 시) 이니셜+색 아바타
function Avatar({ id, box }) {
  const photo = byId(id)?.photo;
  const [failed, setFailed] = useState(false);
  if (photo && !failed) return <img src={photo} alt="" onError={() => setFailed(true)} style={{ width: box.width, height: box.height, borderRadius: box.borderRadius, objectFit: "cover", display: "block", flexShrink: 0 }} />;
  return <span style={{ ...box, background: avatarColor(id) }}>{initialOf(id)}</span>;
}

// ── SVG 아이콘 ──
const Icon = {
  menu: (p) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  bell: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  search: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  calendar: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  users: (p) => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" {...p}><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 6M17 14a5 5 0 0 1 3.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  check: (p) => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" {...p}><path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  sparkle: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill="currentColor"/></svg>),
  arrowRight: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  pointer: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M9 3v10l2.5-2 1.8 4 2-1-1.8-4H17L9 3z" fill="currentColor"/></svg>),
  briefcase: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2"/></svg>),
  chevronDown: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  video: (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><rect x="2" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2"/><path d="m16 10 5-3v10l-5-3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>),
  info: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  copy: (p) => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" {...p}><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M15 5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  whiteboard: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="4" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><path d="M12 17v3M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M7 9h7M7 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  monitor: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><path d="M12 16v3M8 19h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  booth: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><path d="M6.5 4h11a1 1 0 0 1 1 1v15h-13V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9.5 11a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
};

export default function MeetSlot() {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState([
    // 처음 진입 시 나만 선택된 상태로 시작
    { id: "me", required: true },
  ]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState([]); // 선택된 직군들(빈 배열=전체)
  const [durMin, setDurMin] = useState(60); // 회의 길이(분), 기본 1시간
  const [activeCell, setActiveCell] = useState(null); // "컬럼인덱스-시작분" (예: "0-600")
  const [hoverCell, setHoverCell] = useState(null); // 근무시간 밖 hover 프리뷰 { col, day, start }
  const [recos, setRecos] = useState(null); // "추천 시간 찾기" 결과 (계산 전엔 null)
  const [recoSig, setRecoSig] = useState(null); // 계산 당시 조건 서명 (변경 감지용)
  const [fromReco, setFromReco] = useState(false); // 현재 선택이 추천 결과에서 온 것인지(=추천) vs 수동 hover(=가능)
  const [recoLoading, setRecoLoading] = useState(false); // 추천 계산 로딩(연출)
  const [pickedRoom, setPickedRoom] = useState(null);
  const [rightW, setRightW] = useState(340); // 오른쪽 패널 폭(px) — 드래그로 조절
  const [options, setOptions] = useState({ relaxPref: false, online: false });
  const [confirmed, setConfirmed] = useState(null);
  const [tipOpen, setTipOpen] = useState(false); // 필수/선택 안내 툴팁 (클릭 토글)
  const [tipPos, setTipPos] = useState({ cx: 0, bottom: 0 });
  // 오른쪽 패널 왼쪽 경계 드래그 → 폭 조절 (300~560px)
  function startResize(e) {
    e.preventDefault();
    const onMove = (ev) => setRightW(Math.min(560, Math.max(300, window.innerWidth - ev.clientX)));
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "url('/cursors/resize.svg') 13 8, col-resize"; document.body.style.userSelect = "none";
  }
  // 필수/선택 안내 툴팁: 아이콘 클릭 토글. 위치는 fixed(패널 overflow에 안 잘리게)로 클릭 시 계산.
  function toggleTip(e) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setTipPos({ cx: r.left + r.width / 2, bottom: window.innerHeight - r.top + 10 });
    setTipOpen((o) => !o);
  }
  useEffect(() => {
    if (!tipOpen) return;
    const close = () => setTipOpen(false);
    const onDown = (e) => { if (!e.target.closest(".info-tip")) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [tipOpen]);
  const [pendingConfirm, setPendingConfirm] = useState(null); // "다음" → 회의 정보 입력 단계
  const [memo, setMemo] = useState("");
  const [files, setFiles] = useState([]); // 첨부 파일명(목업)
  const [showAdjustAll, setShowAdjustAll] = useState(false);
  // 날짜 선택: 단일(당일) 또는 기간. rangeEnd=null이면 당일. 처음엔 7/20~24(월~금) 선택.
  const [rangeStart, setRangeStart] = useState(new Date(2026, 6, 20));
  const [rangeEnd, setRangeEnd] = useState(new Date(2026, 6, 24));
  const [draft, setDraft] = useState({ start: null, end: null }); // 피커에서 확인 전 임시 선택
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  // 동료에게 물어보기 모달
  const [askOpen, setAskOpen] = useState(false);
  const [askIds, setAskIds] = useState([]); // 물어볼 참석자 id (기본 전체)
  const [askMsg, setAskMsg] = useState("");
  const [askToast, setAskToast] = useState(false); // 보냈어요 상단 토스트
  const [focusedField, setFocusedField] = useState(null); // 포커스된 입력필드 (삭제 아이콘 표시용)
  const [deptOpen, setDeptOpen] = useState(false); // 직군 드롭다운 열림
  // 우측 패널 커스텀 오버레이 스크롤바(네이티브는 숨기고 내용은 좌우 대칭 유지, 스크롤바는 위에 얹어 그림)
  // 스크롤이 가능한 상황이면 항상 표시 → 아래에 내용이 더 있음을 알 수 있게
  const rightRef = useRef(null);
  const [rThumb, setRThumb] = useState({ h: 0, top: 0, show: false });
  function updateRThumb() {
    const el = rightRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 2) { setRThumb((t) => (t.show ? { h: 0, top: 0, show: false } : t)); return; }
    const track = el.clientHeight;
    const h = Math.max(28, (track * el.clientHeight) / el.scrollHeight);
    const top = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * (track - h);
    setRThumb((t) => (t.show && Math.abs(t.h - h) < 0.5 && Math.abs(t.top - top) < 0.5) ? t : { h, top, show: true });
  }
  // 크기 변화(창/패널 리사이즈) 감지 → thumb 갱신
  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateRThumb());
    ro.observe(el);
    window.addEventListener("resize", updateRThumb);
    return () => { ro.disconnect(); window.removeEventListener("resize", updateRThumb); };
  }, []);
  // 우측 패널 내용 변화(추천/상세/확정/입력 등) 시 thumb 재계산 → 스크롤 가능하면 항상 표시
  // 추천 카드가 CSS 애니메이션으로 높이가 나중에 커지므로 지연 재측정도 함께
  useEffect(() => {
    updateRThumb();
    const t1 = setTimeout(updateRThumb, 260);
    const t2 = setTimeout(updateRThumb, 560);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [recos, activeCell, confirmed, pendingConfirm, recoLoading, fromReco, pickedRoom, selected, options, memo, files, title, rightW]);

  // 달력 세로 스크롤: 처음엔 10시가 (sticky 헤더 바로 아래) 상단에 오도록
  const calScrollRef = useRef(null);
  const titleRef = useRef(null);
  const recoTimerRef = useRef(null); // 추천 로딩 setTimeout id (조건 변경 시 취소용)
  const [titleWarn, setTitleWarn] = useState(false);
  useEffect(() => {
    const wrap = calScrollRef.current;
    if (!wrap) return;
    const header = wrap.firstElementChild;
    const headerH = header ? header.offsetHeight : 44;
    const el = wrap.querySelector(`[data-hour="${DEFAULT_SCROLL_MIN}"]`);
    if (el) {
      wrap.scrollTop += el.getBoundingClientRect().top - wrap.getBoundingClientRect().top - headerH;
    } else {
      wrap.scrollTop = ((DEFAULT_SCROLL_MIN - DAY_START) / SLOT) * SLOT_PX + TOP_PAD;
    }
  }, []);

  // 스크롤바 자동 숨김: .mss 컨테이너가 스크롤될 때만 .mss-on 부여(잠시 후 해제)
  useEffect(() => {
    const timers = new Map();
    const onScroll = (e) => {
      const el = e.target;
      if (!el || !el.classList || !el.classList.contains("mss")) return;
      el.classList.add("mss-on");
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => el.classList.remove("mss-on"), 700));
    };
    document.addEventListener("scroll", onScroll, true); // capture: scroll은 버블 안 하므로
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const participants = selected;

  // 날짜 피커 열기(임시선택 초기화)
  function openPicker() {
    setDraft({ start: null, end: null });
    setPickerMonth(new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1));
    setPickerOpen(true);
  }
  // 날짜 클릭 사이클: 하나→당일, 뒤 날짜→기간, 다시→새 당일
  function pickDate(d) {
    setDraft((cur) => {
      if (!cur.start || (cur.start && cur.end)) return { start: d, end: null };
      if (ymd(d) > ymd(cur.start)) return { start: cur.start, end: d };   // 기간
      if (ymd(d) < ymd(cur.start)) return { start: d, end: null };        // 더 이른 날 → 새 당일
      return { start: cur.start, end: null };                            // 같은 날 → 당일 유지
    });
  }
  function confirmDates() {
    if (!draft.start) return;
    setRangeStart(draft.start);
    setRangeEnd(draft.end); // null이면 당일
    setPickerOpen(false); setActiveCell(null); setConfirmed(null);
  }

  // 표시할 days: 선택 구간(rangeStart~rangeEnd) 안의 평일들. 단일이면 그 하루만.
  const days = useMemo(() => {
    const start = rangeStart, end = rangeEnd || rangeStart;
    const out = [];
    let d = start, guard = 0;
    while (ymd(d) <= ymd(end) && guard < 40) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        out.push({ key: DAY_KEYS[dow - 1], label: DAY_LABELS[dow - 1], date: d.getDate(), dateObj: d, isPast: ymd(d) < ymd(TODAY) });
      }
      d = addDays(d, 1); guard++;
    }
    if (out.length === 0) { // 주말만 고른 경우: 가까운 평일 데이터로 하루 표시
      const dow = start.getDay(), idx = dow === 0 ? 4 : Math.min(dow - 1, 4);
      out.push({ key: DAY_KEYS[idx], label: WEEKDAY_KR[dow], date: start.getDate(), dateObj: start, isPast: ymd(start) < ymd(TODAY) });
    }
    return out;
  }, [rangeStart, rangeEnd]);

  const { grid, counts } = useMemo(() => buildGrid(days, durMin, participants, options), [days, durMin, participants, options]);
  const deadEnd = useMemo(() => findBestAlternative(days, durMin, participants), [days, durMin, participants]);

  const selectedIds = selected.map((sx) => sx.id);
  const filteredEmployees = EMPLOYEES.filter((e) => {
    if (deptFilter.length > 0 && !deptFilter.includes(e.dept)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.name, e.dept, e.role, e.team].some((v) => v.toLowerCase().includes(q));
  });

  function toggleEmployee(id) {
    setActiveCell(null); setConfirmed(null);
    setSelected((prev) => {
      const exists = prev.find((p) => p.id === id);
      if (exists) return prev.filter((p) => p.id !== id);
      return [...prev, { id, required: true }]; // 체크하면 항상 필수로 추가
    });
  }
  function toggleRequired(id) {
    setActiveCell(null); setConfirmed(null);
    setSelected((prev) => prev.map((p) => p.id === id ? { ...p, required: !p.required } : p));
  }
  function removeParticipant(id) {
    setActiveCell(null); setConfirmed(null);
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }
  function setOption(key, val) {
    setActiveCell(null); setConfirmed(null);
    setOptions((o) => ({ ...o, [key]: val }));
  }
  // activeCell = "컬럼인덱스-시작분" → 날짜(요일 아님)로 정확히 특정 (멀티주에서도 날짜 안 어긋남)
  const parts = activeCell ? activeCell.split("-") : [null, null];
  const aDi = parts[0] != null ? Number(parts[0]) : null;
  const aSlot = parts[1] != null ? Number(parts[1]) : null;
  const dayLabel = aDi != null ? days[aDi] : null;
  const aDay = dayLabel ? dayLabel.key : null;
  // 항상 즉석 평가 (근무시간 밖·멀티주 모두 정확)
  const active = (aDay != null && aSlot != null) ? evaluateCandidate(aDay, aSlot, durMin, participants, options) : null;
  // 근무시간 내 ready(색블록)는 "추천", 근무시간 밖 수동선택 ready는 "가능"
  const activeInBiz = aSlot != null && aSlot >= BIZ_START && aSlot + durMin <= BIZ_END;
  const activeLabel = active ? ((active.status === "ready" && !activeInBiz) ? "가능" : STATUS_LABEL[active.status]) : "";
  // 회의 구간 표시 문자열
  const slotRangeLabel = aSlot != null ? slotRangeShort(aSlot, aSlot + durMin) : "";
  // 추천 결과(다중): 선택된 것 = 프리미엄 카드, 나머지 = 보조 카드
  const recoPicks = recos && recos.picks ? recos.picks : [];
  // 추천 계산 조건 서명 (참석자/날짜/시간/옵션 변경 감지)
  const recoSigNow = JSON.stringify({ p: participants.map((x) => x.id + (x.required ? "R" : "O")).sort(), s: ymd(rangeStart), e: rangeEnd ? ymd(rangeEnd) : null, d: durMin, o: options });
  const canSearch = participants.length > 0 && days.length > 0 && durMin > 0; // 제목 제외: 참석자+날짜+시간
  // 회의 정보(선택 블록/미팅룸/참석자/날짜/시간/옵션)가 바뀌면 제목 경고 자동 해제
  useEffect(() => { setTitleWarn(false); }, [activeCell, pickedRoom, recoSigNow]);
  // 회의 구성(참석자/날짜/시간/옵션)이 바뀌면 이전 추천은 무효 → 전부 비움(버튼 눌러야만 다시 뜸)
  const didMountReco = useRef(false);
  useEffect(() => {
    if (!didMountReco.current) { didMountReco.current = true; return; } // 첫 렌더엔 초기화 안 함
    // 진행 중인 추천 로딩 타이머가 있으면 취소 (stale 결과가 뒤늦게 뜨는 것 방지)
    if (recoTimerRef.current) { clearTimeout(recoTimerRef.current); recoTimerRef.current = null; }
    setRecos(null); setFromReco(false); setActiveCell(null); setPickedRoom(null); setPendingConfirm(null); setRecoLoading(false);
  }, [recoSigNow]);

  // "다음" → 회의 정보 입력 단계로 (그 순간의 참석자까지 스냅샷으로 고정)
  function goToInfoStep(payload) { setPendingConfirm({ ...payload, attendees: participants.map((p) => nameOf(p.id)).join(", ") }); }
  // 물어보기용 메시지 초안 (회의 정보 + 정중한 톤). 수정 가능.
  function buildAskText() {
    if (!dayLabel || aSlot == null) return "";
    const month = dayLabel.dateObj.getMonth() + 1;
    const dateStr = `${month}월 ${dayLabel.date}일 ${dayLabel.label}요일`;
    // 시간: 시작·끝이 같은 오전/오후면 끝 시간엔 오전/오후 생략
    const start = aSlot, end = aSlot + durMin;
    const startAp = Math.floor(start / 60) < 12 ? "오전" : "오후";
    const endAp = Math.floor(end / 60) < 12 ? "오전" : "오후";
    let eh = Math.floor(end / 60) % 12; if (eh === 0) eh = 12;
    const endStr = endAp === startAp ? `${eh}:${String(end % 60).padStart(2, "0")}` : slotLabel(end);
    return [
      "회의 시간을 맞춰보고 있어요. 아래 시간 괜찮으실까요?",
      "",
      `${dateStr} ${slotLabel(start)}–${endStr}`,
      "",
      "어려우시면 편하게 말씀해 주세요.",
    ].join("\n");
  }
  function openAsk() {
    setAskIds(participants.map((p) => p.id)); // 전체 선택이 디폴트
    setAskMsg(buildAskText());
    setAskOpen(true);
  }
  function toggleAskId(id) { setAskIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); }
  function toggleAskAll() { setAskIds((prev) => (prev.length === participants.length ? [] : participants.map((p) => p.id))); }
  function sendAsk() {
    if (!askIds.length) return;
    setAskOpen(false);
    setAskToast(true);
    setTimeout(() => setAskToast(false), 2600);
  }

  function openCell(key) {
    const [diStr, h] = key.split("-");
    const dayObj = days[Number(diStr)];
    if (!dayObj) return;
    const ev = evaluateCandidate(dayObj.key, Number(h), durMin, participants, options);
    if (!ev) return;
    const hasEvents = eventsInCell(participants, dayObj.key, Number(h)).length > 0;
    // 완전 빈 불가 칸(보여줄 게 없음)만 막고, 일정이 있어 막힌 칸은 열어서 사유를 보여준다.
    if (ev.status === "unfit" && !hasEvents) return;
    setActiveCell(key); setPickedRoom(null); setConfirmed(null); setFromReco(false); setPendingConfirm(null);
  }
  // "일정 추천 받기" → 로딩 연출 후 1순위 추천이 프리미엄 카드로 나타남 + 캘린더 스크롤
  function runRecos() {
    if (recoLoading) return;
    setActiveCell(null); setConfirmed(null);
    setRecoLoading(true);
    const sig = recoSigNow;
    if (recoTimerRef.current) clearTimeout(recoTimerRef.current);
    recoTimerRef.current = setTimeout(() => {
      recoTimerRef.current = null;
      const rs = computeRecos(days, durMin, participants, options);
      setRecos(rs); setRecoSig(sig); setRecoLoading(false);
      if (rs.picks.length) {
        const r = rs.picks[0];
        setActiveCell(`${r.di}-${r.start}`); setPickedRoom(null); setFromReco(true);
        scrollToSlot(r.start);
      } else {
        setActiveCell(null); setFromReco(false);
      }
    }, 1000);
  }
  // "일정 추천 받기" 버튼 내부(글로우 레이어 + 별 + 텍스트) — 5군데 재사용 (컴포넌트 166:7437)
  const recoInner = () => (
    <>
      <span aria-hidden style={s.recoGlowBot} />
      <span aria-hidden style={s.recoGlowTop} />
      <img src="/icons/reco-star-l.svg" width="14" height="14" alt="" style={s.recoStar} />
      <span style={s.recoLabel}>추천 시간 찾기</span>
      <span aria-hidden style={{ width: 14, flexShrink: 0, position: "relative", zIndex: 4 }} />
      <span aria-hidden style={s.recoInset} />
    </>
  );
  // 아코디언 선택 → 그 카드가 펼쳐짐(펼침만 애니, 접힘은 즉시)
  function scrollToSlot(start) {
    const wrap = calScrollRef.current;
    if (wrap) wrap.scrollTo({ top: Math.max(0, ((start - DAY_START) / SLOT) * SLOT_PX + TOP_PAD - 40), behavior: "smooth" });
  }
  function selectPick(p) {
    setActiveCell(`${p.di}-${p.start}`); setPickedRoom(null); setConfirmed(null); setFromReco(true);
    scrollToSlot(p.start); // 펼친 추천의 블록으로 캘린더가 바로 스크롤(포커스)
  }
  // 빈 시간 hover 슬롯 계산: 근무시간 안/밖 상관없이 기존 일정과 안 겹치는 빈 시간이면 선택 가능
  function hoverSlotAt(d, clientY, colEl) {
    if (d.isPast) return null;
    const rect = colEl.getBoundingClientRect();
    const start = DAY_START + Math.floor((clientY - rect.top) / SLOT_PX) * SLOT;
    if (start < DAY_START || start + durMin > DAY_END) return null;
    if (ymd(d.dateObj) === ymd(TODAY) && start < NOW_MIN) return null; // 오늘 지난 시간 제외
    if (participants.some((p) => personBusy(p.id, d.key, start, start + durMin))) return null; // 기존 일정 겹침
    return start;
  }

  const good = counts.ready > 0;

  return (
    <div style={s.app}>
      <style>{globalCss}</style>

      <header style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.iconBtn} aria-label="메뉴"><img src="/icons/menu.svg" width="28" height="28" alt="" /></button>
          <nav style={s.nav}>
            <button className="nav-item" style={{ ...s.navItem, ...s.navActive }}>일정 잡기</button>
            <button className="nav-item" style={s.navItem}>내 일정</button>
          </nav>
        </div>
        <button style={s.iconBtn} aria-label="알림"><img src="/icons/notification.svg" width="28" height="28" alt="" /></button>
      </header>

      <div style={{ ...s.body, gridTemplateColumns: `288px minmax(0, 1fr) ${rightW}px`, position: "relative" }}>
        <div className="rz-handle" onMouseDown={startResize} title="드래그해서 오른쪽 패널 폭 조절" style={{ right: rightW - 3 }} />
        {/* 좌측 */}
        <aside className="mss" style={s.left}>
          {/* 상단 폼: 회의방식 탭 → 회의명 → 회의 길이 → 날짜 (라벨/타이틀 없음, gap 16) */}
          <div style={s.formTop}>
            <div style={s.methodTabs}>
              <div aria-hidden style={{ ...s.methodInd, transform: options.online ? "translateX(calc(100% + 3px))" : "translateX(0)" }} />
              <button className={options.online ? "method-tab" : ""} style={{ ...s.methodTab, ...(!options.online ? s.methodTabOn : {}) }}
                onClick={() => setOption("online", false)}>오프라인</button>
              <button className={!options.online ? "method-tab" : ""} style={{ ...s.methodTab, ...(options.online ? s.methodTabOn : {}) }}
                onClick={() => setOption("online", true)}>온라인</button>
            </div>
            <div style={s.durChips}>
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => { setDurMin(d); setActiveCell(null); setConfirmed(null); }}
                  style={{ ...s.durChip, ...(durMin === d ? s.durChipOn : {}) }}>
                  {fmtDurChip(d)}
                </button>
              ))}
              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                <button onClick={() => { /* 모달 형식 (시연에서는 동작 안 함) */ }}
                  style={{ ...s.durChip, width: "100%", ...(!DURATIONS.includes(durMin) ? s.durChipOn : {}) }}>
                  {!DURATIONS.includes(durMin) ? fmtDurChip(durMin) : "직접"}
                </button>
              </div>
            </div>
            <div style={{ position: "relative", width: "100%" }}>
              <button className="field" style={s.dateField} onClick={openPicker}>
                <span>{dateRangeLabel(days)}</span>
                <img src="/icons/calendar.svg" width="16" height="16" alt="" />
              </button>
              {pickerOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setPickerOpen(false)} />
                  <MiniCalendar
                    month={pickerMonth}
                    setMonth={setPickerMonth}
                    draft={draft}
                    onPick={pickDate}
                    onConfirm={confirmDates}
                  />
                </>
              )}
            </div>
          </div>
          <div style={s.divider} />
          <div style={s.partSection}>
            <div style={s.panelSubhead}>
              <span style={s.panelTitle2}>참석자</span>
              <span style={s.counterPill}>{selected.length}<span style={s.counterMax}>명</span></span>
            </div>
            <div style={s.partBody}>
              <div style={s.partFields}>
                <div style={s.searchWrap}>
                  <span style={s.searchIcon}><img src="/icons/search.svg" width="16" height="16" alt="" /></span>
                  <input className="field" style={s.searchInput} value={search} onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setFocusedField("search")} onBlur={() => setFocusedField(null)} placeholder="이름 검색" />
                  {search && (
                    <button style={s.clearBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => setSearch("")}>
                      <img src="/icons/xmark.svg" width="9" height="9" alt="" />
                    </button>
                  )}
                </div>
                <div style={s.deptWrap}>
                  <button className="field" style={s.deptTrigger} onClick={() => setDeptOpen((v) => !v)}>
                    <span style={s.deptTriggerText}>{deptFilter.length === 0 ? "모든 직군" : deptFilter.length <= 2 ? deptFilter.join(", ") : `${deptFilter.length}개 직군`}</span>
                    <img src="/icons/chevron.svg" width="18" height="18" alt="" style={{ flexShrink: 0 }} />
                  </button>
                  {deptOpen && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setDeptOpen(false)} />
                      <div style={s.deptMenu}>
                        {[["all", "모든 직군"], ...DEPTS.map((d) => [d, d])].map(([val, label]) => {
                          const sel = val === "all" ? deptFilter.length === 0 : deptFilter.includes(val);
                          return (
                            <button key={val} className="dept-item"
                              onClick={() => {
                                if (val === "all") setDeptFilter([]);
                                else setDeptFilter((prev) => prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]);
                              }}
                              style={{ ...s.deptItem, ...(sel ? s.deptItemSel : {}) }}>
                              <span>{label}</span>
                              {sel && <img src="/icons/check-blue.svg" width="14" height="14" alt="" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="cal-scroll" style={s.empList}>
                {filteredEmployees.map((e) => {
                  const isSel = selectedIds.includes(e.id);
                  return (
                    <button key={e.id} onClick={() => toggleEmployee(e.id)} className="emp-row"
                      style={{ ...s.empRow, background: isSel ? T.gray50 : "transparent" }}>
                      <span style={{ ...s.checkbox, ...(isSel ? s.checkboxOn : {}) }}>{isSel && <img src="/icons/check.svg" width="13" height="13" alt="" />}</span>
                      <Avatar id={e.id} box={s.avatar} />
                      <span style={s.empInfo}>
                        <span style={s.empName}>{e.name}{e.id === ME_ID ? <span style={s.meTag}>(나)</span> : ""}</span>
                        <span style={s.empMeta}>{e.dept} · {e.role}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* 중앙 */}
        <main style={s.center}>
          <div style={s.attendeeBar}>
            <span style={s.attendeeBarTitle}><img src="/icons/users.svg" alt="" style={{ width: 18, height: 13.07, display: "block", flexShrink: 0 }} /> 참석자 {selected.length}명
              {selected.length > 0 && (
                <>
                  <span style={s.attCount}>
                    <span style={s.attCountReq}>필수 {selected.filter((p) => p.required).length}</span>
                    <span style={s.attCountDot}>·</span>
                    <span style={s.attCountOpt}>선택 {selected.filter((p) => !p.required).length}</span>
                  </span>
                  <span className="info-tip">
                    <img src="/icons/info.svg" width="15" height="15" alt="필수·선택 안내" role="button" tabIndex={0} onClick={toggleTip} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleTip(e); }} />
                    {tipOpen && (
                      <span className="info-bubble" role="tooltip" style={{ position: "fixed", left: tipPos.cx, bottom: tipPos.bottom, transform: "translateX(-50%)" }}>필수는 꼭 참석, 선택은 참석하지 않아도 돼요. 이름 옆 배지를 눌러 변경할 수 있어요.</span>
                    )}
                  </span>
                </>
              )}
            </span>
            <div style={s.attendeeChips}>
              {selected.map((p) => (
                <div key={p.id} style={s.attChip}>
                  <span style={s.attName}>{displayName(p.id)}</span>
                  <button onClick={() => toggleRequired(p.id)} aria-label={p.required ? "필수 (누르면 선택)" : "선택 (누르면 필수)"}
                    className={`att-badge ${p.required ? "att-badge-req" : "att-badge-opt"}`} style={s.attBadge}>
                    {p.required ? "필수" : "선택"}
                  </button>
                  <button onClick={() => removeParticipant(p.id)} className="att-x" aria-label="제외" style={s.attX}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4.2002 4L6.7002 1.5M4.2002 4L1.7002 1.5M4.2002 4L1.7002 6.5M4.2002 4L6.7002 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
              {selected.length === 0 && <span style={s.emptyHint}>왼쪽에서 참석자를 선택하세요</span>}
            </div>
          </div>

          <div className="cal-scroll" style={s.calWrap} ref={calScrollRef}>
            {/* 헤더: 요일 */}
            <div style={{ ...s.calHeadRow, gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
              <div />
              {days.map((d, di) => {
                const sun = d.dateObj.getDay() === 0;
                return (
                  <div key={`${d.key}-${di}`} style={{ ...s.calDayHead, opacity: d.isPast ? 0.4 : 1, borderLeft: di === 0 ? "none" : `1px solid ${T.gray100}` }}>
                    <span style={{ ...s.calDayText, color: sun ? "#F04452" : "#4E5968" }}>{d.dateObj.getMonth() + 1}. {d.date} ({d.label})</span>
                  </div>
                );
              })}
            </div>
            {/* 본문: 시간축 + 날짜별 컬럼(절대 위치 블록). 표시는 풀데이(0~24시). */}
            <div style={{ ...s.calBody, gridTemplateColumns: `64px repeat(${days.length}, 1fr)`, gridTemplateRows: "1fr", flexShrink: 0, height: DAY_SLOTS.length * SLOT_PX + TOP_PAD * 2, paddingTop: TOP_PAD, paddingBottom: TOP_PAD }}>
              {/* 격자선: 정각=실선, 30분=점선(가로) + 요일 컬럼 세로선. 하단(오후 11시 반)까지 풀 높이. 시간 선택과 무관하게 고정 */}
              <div style={{ position: "absolute", top: TOP_PAD, left: 64, right: 0, height: DAY_SLOTS.length * SLOT_PX, pointerEvents: "none" }}>
                {DAY_SLOTS.map((s2) => (
                  <div key={s2} style={{ position: "absolute", left: 0, right: 0, top: (s2 / SLOT) * SLOT_PX, borderTop: s2 % 60 === 0 ? `1px solid ${T.gray100}` : `1px dotted ${T.gray100}` }} />
                ))}
                {days.map((_, i) => i === 0 ? null : (
                  <div key={"v" + i} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / days.length) * 100}%`, borderLeft: `1px solid ${T.gray100}` }} />
                ))}
              </div>
              {/* 시간축 */}
              <div style={s.calAxis}>
                {DAY_SLOTS.filter((s2) => s2 % 60 === 0 && s2 !== 0).map((s2) => (
                  <div key={s2} data-hour={s2} style={{ ...s.calAxisLabel, top: ((s2 - DAY_START) / SLOT) * SLOT_PX }}>{axisLabel(s2)}</div>
                ))}
              </div>
              {/* 날짜 컬럼 */}
              {days.map((d, di) => {
                const evBlocks = dayEventBlocks(participants, d.key);
                const isToday = ymd(d.dateObj) === ymd(TODAY);
                const candBlocks = d.isPast ? [] : dayCandidateBlocks(d.key, durMin, participants, options).filter((b) => !(isToday && b.start < NOW_MIN));
                // 후보 블록(색블록)이 이미 그 시간대 상태를 표시하므로, 겹치는 회색 일정 블록은 숨긴다 → 회색이 뒤로 삐져나오는 이중표시 방지
                const shownEvBlocks = evBlocks.filter((eb) => !candBlocks.some((cb) => cb.start < eb.end && eb.start < cb.end));
                // '가능'(파랑)은 블록으로 깔지 않음 — 빈 공간을 클릭해 원하는 30분 시작으로 직접 잡게. 확인필요/회의실없음만 블록 표시.
                const shownCandBlocks = candBlocks.filter((b) => b.status !== "ready");
                return (
                  <div key={`${d.key}-${di}`}
                    style={{ ...s.calCol, opacity: d.isPast ? 0.5 : 1, cursor: (hoverCell && hoverCell.col === di) ? "pointer" : "default" }}
                    onMouseMove={(e) => { const st = hoverSlotAt(d, e.clientY, e.currentTarget); setHoverCell(st != null ? { col: di, day: d.key, start: st } : null); }}
                    onMouseLeave={() => setHoverCell((h) => (h && h.col === di ? null : h))}
                    onClick={() => { if (hoverCell && hoverCell.col === di) openCell(`${di}-${hoverCell.start}`); }}>
                    {/* 근무시간 밖 hover 프리뷰 (연한 회색, 회의 길이만큼) */}
                    {hoverCell && hoverCell.col === di && (
                      <div style={{ position: "absolute", left: 3, right: 3, top: ((hoverCell.start - DAY_START) / SLOT) * SLOT_PX + 1.5, height: (durMin / SLOT) * SLOT_PX - 3, background: T.blueBgSoft, borderRadius: 7, pointerEvents: "none", zIndex: 1 }} />
                    )}
                    {/* 기존 일정 블록 (회색, 시간대별 요약) — 후보 블록과 겹치는 건 제외 */}
                    {shownEvBlocks.map((b, i) => {
                      const top = ((b.start - DAY_START) / SLOT) * SLOT_PX;
                      const height = ((b.end - b.start) / SLOT) * SLOT_PX;
                      const evKey = `${di}-${b.start}`;
                      // 일정이 있는 블록은 상태(불가/확인필요/회의실없음)와 무관하게 항상 클릭 → 상세 열기
                      const clickable = !d.isPast;
                      const evActive = activeCell === evKey;
                      const multi = b.people.length > 1;
                      const short = height <= 40; // 30분처럼 좁은 블록
                      return (
                        <button key={"e" + i} onClick={(e) => { e.stopPropagation(); if (clickable) openCell(evKey); }}
                          style={{ ...s.evBlock, top: top + 1.5, height: height - 3, cursor: clickable ? "pointer" : "default",
                            padding: short ? "0 8px" : "8px 8px 4px", justifyContent: short ? "center" : "flex-start",
                            boxShadow: evActive ? `inset 0 0 0 2px ${T.gray400}, 0 4px 12px rgba(0,0,0,0.12)` : "none",
                            zIndex: evActive ? 20 : "auto" }}>
                          {short ? (
                            // 30분처럼 좁은 블록: 이름 없이 "N명 일정 있음"만
                            <span style={s.evBlockTitle}>{b.people.length}명 일정 있음</span>
                          ) : (b.people.length === 1 && b.people[0].id === ME_ID) ? (
                            // 본인 단독 일정만 회의 제목 노출
                            <>
                              <span style={s.evBlockTitle}>{b.people[0].title}</span>
                              <span style={s.evBlockWho}>{displayName(b.people[0].id)}</span>
                            </>
                          ) : (
                            // 타인 일정(단독/여러 명): 제목 대신 인원수 + 참석자 이름
                            <>
                              <span style={s.evBlockTitle}>{b.people.length}명 일정 있음</span>
                              <span style={s.evBlockWho}>{b.people.map((p) => nameOf(p.id)).join(", ")}</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                    {/* 실시간 후보 블록 (파랑/노랑/빨강). 근무시간 내 계산. */}
                    {shownCandBlocks.map((b, i) => {
                      const top = ((b.start - DAY_START) / SLOT) * SLOT_PX;
                      const height = ((b.end - b.start) / SLOT) * SLOT_PX;
                      const tok = STATUS[b.status];
                      const key = `${di}-${b.start}`;
                      const isActive = activeCell === key;
                      const short = height <= 40;
                      return (
                        <button key={"c" + i} className="cand-block" onClick={(e) => { e.stopPropagation(); openCell(key); }}
                          style={{ ...s.candBlock, top: top + 1.5, height: height - 3,
                            padding: short ? "0 9px" : "10px 9px 7px", alignItems: short ? "center" : "flex-start",
                            background: tok.bg, zIndex: isActive ? 20 : 3,
                            boxShadow: isActive ? `inset 0 0 0 2px ${tok.solid}, 0 4px 12px rgba(0,0,0,0.12)` : "none",
                            transition: "box-shadow .2s ease, filter .15s ease" }}>
                          <span style={{ ...s.candBlockDot, background: tok.solid, marginTop: short ? 0 : 4 }} />
                          <span style={{ ...s.candBlockLabel, color: tok.text }}>{STATUS_LABEL[b.status]}</span>
                        </button>
                      );
                    })}
                    {/* 클릭해 잡은 슬롯 강조 — 색 블록(확인필요/회의실없음)에 없는 활성 슬롯(=가능 또는 근무시간 밖)을 여기서 렌더 */}
                    {aDi === di && aSlot != null && active && active.status !== "unfit" && !shownCandBlocks.some((b) => b.start === aSlot) && (() => {
                      const tok = STATUS[active.status];
                      const top = ((aSlot - DAY_START) / SLOT) * SLOT_PX;
                      const height = (durMin / SLOT) * SLOT_PX;
                      const short = height <= 40;
                      return (
                        <div style={{ ...s.candBlock, top: top + 1.5, height: height - 3,
                          padding: short ? "0 9px" : "10px 9px 7px", alignItems: short ? "center" : "flex-start",
                          background: tok.bg, zIndex: 20, pointerEvents: "none",
                          boxShadow: `inset 0 0 0 2px ${tok.solid}, 0 4px 12px rgba(0,0,0,0.12)` }}>
                          <span style={{ ...s.candBlockDot, background: tok.solid, marginTop: short ? 0 : 4 }} />
                          <span style={{ ...s.candBlockLabel, color: tok.text }}>{activeLabel}</span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={s.legend}>
            {["ready", "check", "adjust", "unfit"].map((k) => (
              <span key={k} style={s.legendItem}>
                <span style={{ ...s.legendDot, background: STATUS[k].bg, border: `1.5px solid ${STATUS[k].border}` }} />
                {STATUS_LABEL[k]}
              </span>
            ))}
            <span style={s.legendItem}>
              <span style={{ ...s.legendDot, background: T.gray100, border: `1.5px solid ${T.gray200}` }} />기존 일정
            </span>
          </div>
        </main>

        {/* 우측 */}
        <div style={s.rightWrap}>
        <aside ref={rightRef} className="mss mss-noscroll" style={s.right} onScroll={updateRThumb} onAnimationEnd={updateRThumb}>

          {/* 확정 → 추천계산 로딩 → 카드(추천/가능) → 빈 상태 */}
          {confirmed ? (
            <div style={{ ...s.confirmBox, paddingTop: 40 }}>
              <div style={s.confirmHead}>
                <div style={s.confirmIcon}><img src="/icons/check-circle.svg" width="22" height="22" alt="" /></div>
                <div style={s.confirmTitle}>회의가 잡혔어요</div>
              </div>
              <div style={s.confirmCard}>
                <div style={s.confirmName}>{confirmed.title}</div>
                <div style={s.confirmCardDivider} />
                <div style={s.confirmRows}>
                <div style={s.confirmRow}>
                  <span style={s.calIconBox}><img src="/icons/cal-check-c.svg" width="13" height="13" alt="" /></span>
                  <span style={{ ...s.confirmRowText, whiteSpace: "nowrap" }}>{confirmed.dayLabel} · {confirmed.timeLabel}</span>
                </div>
                <div style={s.confirmRow}>
                  <img src={confirmed.room === "온라인" ? "/icons/online-c.svg" : "/icons/location-c.svg"} width="16" height="16" alt="" style={{ flexShrink: 0 }} />
                  <span style={s.confirmRowText}>{confirmed.room}</span>
                </div>
                <div style={{ ...s.confirmRow, alignItems: "flex-start" }}>
                  <img src="/icons/users3-c.svg" width="16" height="16" alt="" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={s.confirmRowText}>{participants.map((p) => nameOf(p.id)).join(", ")}</span>
                </div>
                {confirmed.memo && (
                  <div style={{ ...s.confirmRow, alignItems: "flex-start" }}>
                    <img src="/icons/memo.svg" width="16" height="16" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={s.confirmRowText}>{confirmed.memo}</span>
                  </div>
                )}
                {confirmed.files && confirmed.files.length > 0 && (
                  <div style={{ ...s.confirmRow, alignItems: "flex-start" }}>
                    <img src="/icons/attach.svg" width="16" height="16" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={s.confirmRowText}>{confirmed.files.join(", ")}</span>
                  </div>
                )}
                </div>
              </div>
              <button style={{ ...s.secondaryBtn, cursor: "default" }}>내 일정 보기</button>
            </div>
          ) : pendingConfirm ? (
            <div style={{ ...s.confirmBox, gap: 24 }}>
              <div style={s.infoTop}>
                <div style={s.infoHead}>
                  <button onClick={() => setPendingConfirm(null)} aria-label="뒤로" style={s.infoBack}><img src="/icons/cal-prev.svg" width="20" height="20" alt="" /></button>
                  <span style={s.infoHeadTitle}>회의 정보 입력</span>
                </div>
                <div style={s.infoSummary}>
                  <div style={s.confirmRow}>
                    <span style={s.calIconBox}><img src="/icons/cal-check.svg" width="13" height="13" alt="" /></span>
                    <span style={{ ...s.confirmRowText, whiteSpace: "nowrap" }}>{pendingConfirm.dayLabel} · {pendingConfirm.timeLabel}</span>
                  </div>
                  <div style={s.confirmRow}>
                    <img src={pendingConfirm.room === "온라인" ? "/icons/online.svg" : "/icons/location.svg"} width="16" height="16" alt="" style={{ flexShrink: 0 }} />
                    <span style={s.confirmRowText}>{pendingConfirm.room}</span>
                  </div>
                  <div style={{ ...s.confirmRow, alignItems: "flex-start" }}>
                    <img src="/icons/users3.svg" width="16" height="16" alt="" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={s.confirmRowText}>{pendingConfirm.attendees}</span>
                  </div>
                </div>
                <div style={s.confirmCardDivider} />
                <div style={s.infoFields}>
                  <div style={s.infoField}>
                    <span style={s.infoLabel}>제목</span>
                    <input className="field" style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="회의 제목 입력" />
                  </div>
                  <div style={s.infoField}>
                    <span style={s.infoLabel}>메모</span>
                    <textarea className="field" style={s.memoInput} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="남길 메모 혹은 안건 입력" />
                  </div>
                  <div style={s.infoField}>
                    <span style={s.infoLabel}>파일</span>
                    <div style={{ ...s.fileAdd, cursor: "default" }}><img src="/icons/clip.svg" width="16" height="16" alt="" />파일 첨부</div>
                  </div>
                </div>
              </div>
              <button style={s.primaryBtn} onClick={() => { setConfirmed({ ...pendingConfirm, title: title.trim() || "회의", memo: memo.trim(), files: [...files] }); setPendingConfirm(null); setTitle(""); setMemo(""); setFiles([]); setTitleWarn(false); }}>확정하기</button>
            </div>
          ) : recoLoading ? (
            <button className="reco-magic reco-loading" disabled style={{ ...s.recoBtn, border: "1px solid transparent", cursor: "default" }}>
              {recoInner()}
            </button>
          ) : (fromReco && recoPicks.length) ? (
            <>
              {recoPicks.map((p, idx) => {
                const dl = days[p.di];
                const selected = `${p.di}-${p.start}` === activeCell;
                const reasonHead = recoReason(p);
                if (!selected || !active || !dl) {
                  return (
                    <button key={`${p.di}-${p.start}`} onClick={() => selectPick(p)} style={s.accCard}>
                      <div style={s.accColInner}>
                        <div style={s.premiumTop}>
                          <span style={s.accColLabel}>추천 {idx + 1}</span>
                          <img src="/icons/chevron-down.svg" width="18" height="18" alt="" />
                        </div>
                        <div style={{ ...s.accColTitle, color: "#4E5968" }}>{reasonHead}</div>
                      </div>
                    </button>
                  );
                }
                return (
                    <div key={`${p.di}-${p.start}`} className="reco-open" style={s.premiumCard}>
                      <div aria-hidden style={{ position: "absolute", left: -35, top: -33, width: 266, height: 117, pointerEvents: "none", zIndex: -1 }}>
                        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#86CBE9", opacity: 0.2, filter: "blur(43px)" }} />
                      </div>
                      <div style={s.dHead}>
                        <div style={s.premiumTop}>
                          <span className="reco-tag-grad">추천 {idx + 1}</span>
                          <button onClick={() => setActiveCell(null)} aria-label="접기" style={s.premiumCollapse}><img src="/icons/chevron-up.svg" width="18" height="18" alt="" /></button>
                        </div>
                        <div className="reco-headline-grad" style={s.premiumHeadlineBase}>{reasonHead}</div>
                        <div style={s.premiumTime}>{fullDateLabel(dl)} · {slotRangeShort(p.start, p.end)}</div>
                        <div style={s.dSub}>
                          <span style={{ ...s.dSubDot, background: STATUS[tierStatus(p.tier)].solid }} />
                          <span style={s.dSubText}>{recoDesc(p)}</span>
                        </div>
                      </div>
                      <div style={s.dDivider} />
                      <div style={s.dRows}>
                        <Row label="필수 참석자" value={`${participants.filter((x) => x.required).length}명 전원 가능`} />
                        <Row label="선택 참석자" value={active.busyOptional.length ? `${active.busyOptional.map(nameOf).join(", ")} 불참 가능` : "전원 가능"} />
                        {(() => {
                          const focusIds = options.relaxPref ? [] : [...new Set([...active.prefConflicts, ...active.fieldwork])];
                          const n = focusIds.length;
                          return <Row label="확인 필요" value={n ? `${n}명` : "없음"} tone={n ? "warn" : undefined} />;
                        })()}
                        {!options.online && <Row label="회의실" value={active.roomsFree.length ? `${active.roomsFree.length}곳 가능` : "없음"} tone={active.roomsFree.length ? undefined : "danger"} />}
                      </div>
                      {options.online ? (
                        <>
                          <div style={s.dDivider} />
                          <div style={s.btnCol}>
                            <button style={s.copyBtn} onClick={openAsk}><img src="/icons/ask.svg" width="16" height="16" alt="" /><span style={s.copyBtnText}>동료에게 물어보기</span></button>
                            <button style={s.primaryBtn} onClick={() => goToInfoStep({ dayLabel: `${fullDateLabel(dl)}`, timeLabel: `${slotRangeShort(p.start, p.end)}`, room: "온라인" })}>다음</button>
                          </div>
                        </>
                      ) : active.roomsFree.length > 0 ? (
                        <>
                          <div style={s.dDivider} />
                          <div style={s.roomList}>
                            {active.roomsFree.map((r) => (
                              <button key={r.id} onClick={() => setPickedRoom(r.id)}
                                style={{ ...s.roomRow, borderColor: pickedRoom === r.id ? T.blue : "#E5E8EB", boxShadow: pickedRoom === r.id ? `inset 0 0 0 1px ${T.blue}` : "none", background: T.white }}>
                                <span style={s.roomThumb}>{r.img && <img src={r.img} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}</span>
                                <span style={s.roomInfo}>
                                  <span style={s.roomNameRow}><span style={s.roomName}>{r.name}</span></span>
                                  <span style={s.roomMeta}>{r.floor ? `${r.floor} · ` : ""}{r.capacity === 99 ? "인원 제한 없음" : `${r.capacity}인`}</span>
                                </span>
                                <span style={{ ...s.roomRadio, ...(pickedRoom === r.id ? s.roomRadioOn : {}) }}>{pickedRoom === r.id && <img src="/icons/check.svg" width="11" height="11" alt="" />}</span>
                              </button>
                            ))}
                          </div>
                          <div style={s.btnCol}>
                            <button style={s.copyBtn} onClick={openAsk}><img src="/icons/ask.svg" width="16" height="16" alt="" /><span style={s.copyBtnText}>동료에게 물어보기</span></button>
                            <button style={{ ...s.primaryBtn, background: pickedRoom ? T.blue : "#C9E2FF", cursor: pickedRoom ? "pointer" : "default" }} disabled={!pickedRoom}
                              onClick={() => { const room = active.roomsFree.find((r) => r.id === pickedRoom); goToInfoStep({ dayLabel: `${fullDateLabel(dl)}`, timeLabel: `${slotRangeShort(p.start, p.end)}`, room: room.floor ? `${room.name} (${room.floor})` : room.name }); }}>다음</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={s.dDivider} />
                          <button style={s.onlineBtn} onClick={() => goToInfoStep({ dayLabel: `${fullDateLabel(dl)}`, timeLabel: `${slotRangeShort(p.start, p.end)}`, room: "온라인" })}>
                            <img src="/icons/online-btn.svg" width="16" height="16" alt="" /><span style={s.onlineBtnText}>온라인으로 잡기</span>
                          </button>
                        </>
                      )}
                    </div>
                  );
              })}
            </>
          ) : active ? (
            <>
              <button className="reco-magic" disabled={!canSearch} style={{ ...s.recoBtn, ...(canSearch ? {} : { opacity: 0.5, cursor: "default" }) }} onClick={runRecos}>
                {recoInner()}
              </button>
              {active.status === "unfit" ? (
              <div style={s.detailBox}>
                <div style={s.dHead}>
                  <span style={{ ...s.dTag, background: CARD_TAG.unfit.bg, color: CARD_TAG.unfit.text }}>
                    <span style={{ ...s.dTagDot, background: CARD_TAG.unfit.dot }} />
                    {STATUS_LABEL.unfit}
                  </span>
                  <div style={s.dTitle}>{fullDateLabel(dayLabel)} · {slotRangeLabel}</div>
                  <div style={s.dSub}>
                    <span style={{ ...s.dSubDot, background: CARD_TAG.unfit.dot }} />
                    <span style={s.dSubText}>필수 참석자가 다른 일정과 겹쳐 잡을 수 없어요</span>
                  </div>
                </div>
                <div style={s.dDivider} />
                <div style={s.busyBox}>
                  <div style={s.busyLabel}>이 시간에 일정이 있는 참석자</div>
                  <div style={s.busyList}>
                    {participants
                      .filter((p) => personBusy(p.id, aDay, aSlot, aSlot + durMin))
                      .sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0))
                      .map((p) => {
                        const ev = eventOverlapping(p.id, aDay, aSlot, aSlot + durMin);
                        return (
                          <div key={p.id} style={s.busyRow}>
                            <Avatar id={p.id} box={s.busyAvatar} />
                            <span style={s.busyName}>{nameOf(p.id)}</span>
                            <span style={s.busyEvent}>{ev ? ev.title : "다른 일정"}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
            <div style={s.detailBox}>
              <div style={s.dHead}>
                <span style={{ ...s.dTag, background: CARD_TAG[active.status].bg, color: CARD_TAG[active.status].text }}>
                  <span style={{ ...s.dTagDot, background: CARD_TAG[active.status].dot }} />
                  {activeLabel}
                </span>
                <div style={s.dTitle}>{fullDateLabel(dayLabel)} · {slotRangeLabel}</div>
                <div style={s.dSub}>
                  <span style={{ ...s.dSubDot, background: CARD_TAG[active.status].dot }} />
                  <span style={s.dSubText}>{(() => {
                    if (active.status !== "check") return STATUS_HINT[active.status];
                    const focusIds = options.relaxPref ? [] : [...new Set([...active.prefConflicts, ...active.fieldwork])];
                    if (focusIds.length) return `${focusIds.map(nameOf).join(", ")}님이 이 시간을 회의를 피하고 싶은 시간으로 설정했어요`;
                    if (active.busyOptional.length) return `${active.busyOptional.map(nameOf).join(", ")}님은 다른 일정이 있어 못 올 수 있어요`;
                    return STATUS_HINT.check;
                  })()}</span>
                </div>
              </div>
              <div style={s.dDivider} />
              <div style={s.dRows}>
                <Row label="필수 참석자" value={`${participants.filter((p) => p.required).length}명 전원 가능`} />
                <Row label="선택 참석자" value={active.busyOptional.length ? `${active.busyOptional.map(nameOf).join(", ")} 불참 가능` : "전원 가능"} />
                {(() => {
                  const focusIds = options.relaxPref ? [] : [...new Set([...active.prefConflicts, ...active.fieldwork])];
                  const n = focusIds.length;
                  return <Row label="확인 필요" value={n ? `${n}명` : "없음"} tone={n ? "warn" : undefined} />;
                })()}
                {!options.online && <Row label="회의실" value={active.roomsFree.length ? `${active.roomsFree.length}곳 가능` : "없음"} tone={active.roomsFree.length ? undefined : "danger"} />}
              </div>
              {options.online ? (
                <>
                  <div style={s.dDivider} />
                  <div style={s.btnCol}>
                    <button style={s.copyBtn} onClick={openAsk}>
                      <img src="/icons/ask.svg" width="16" height="16" alt="" />
                      <span style={s.copyBtnText}>동료에게 물어보기</span>
                    </button>
                    <button style={s.primaryBtn}
                      onClick={() => goToInfoStep({ dayLabel: `${fullDateLabel(dayLabel)}`, timeLabel: slotRangeLabel, room: "온라인" })}>
                      다음
                    </button>
                  </div>
                </>
              ) : active.roomsFree.length > 0 ? (
                <>
                  <div style={s.dDivider} />
                  <div style={s.roomList}>
                    {active.roomsFree.map((r) => (
                      <button key={r.id} onClick={() => setPickedRoom(r.id)}
                        style={{ ...s.roomRow, borderColor: pickedRoom === r.id ? T.blue : "#E5E8EB", boxShadow: pickedRoom === r.id ? `inset 0 0 0 1px ${T.blue}` : "none", background: T.white }}>
                        <span style={s.roomThumb}>
                          {r.img && <img src={r.img} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                        </span>
                        <span style={s.roomInfo}>
                          <span style={s.roomNameRow}>
                            <span style={s.roomName}>{r.name}</span>
                          </span>
                          <span style={s.roomMeta}>{r.floor ? `${r.floor} · ` : ""}{r.capacity === 99 ? "인원 제한 없음" : `${r.capacity}인`}</span>
                        </span>
                        <span style={{ ...s.roomRadio, ...(pickedRoom === r.id ? s.roomRadioOn : {}) }}>{pickedRoom === r.id && <img src="/icons/check.svg" width="11" height="11" alt="" />}</span>
                      </button>
                    ))}
                  </div>
                  <div style={s.btnCol}>
                    <button style={s.copyBtn} onClick={openAsk}>
                      <img src="/icons/ask.svg" width="16" height="16" alt="" />
                      <span style={s.copyBtnText}>동료에게 물어보기</span>
                    </button>
                    <button style={{ ...s.primaryBtn, background: pickedRoom ? T.blue : "#C9E2FF", cursor: pickedRoom ? "pointer" : "default" }} disabled={!pickedRoom}
                      onClick={() => {
                        const room = active.roomsFree.find((r) => r.id === pickedRoom);
                        goToInfoStep({ dayLabel: `${fullDateLabel(dayLabel)}`, timeLabel: slotRangeLabel, room: room.floor ? `${room.name} (${room.floor})` : room.name });
                      }}>
                      다음
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={s.dDivider} />
                  <button style={s.onlineBtn} onClick={() => goToInfoStep({ dayLabel: `${fullDateLabel(dayLabel)}`, timeLabel: slotRangeLabel, room: "온라인" })}>
                    <img src="/icons/online-btn.svg" width="16" height="16" alt="" />
                    <span style={s.onlineBtnText}>온라인으로 잡기</span>
                  </button>
                </>
              )}
            </div>
            )}
            </>
          ) : (recos && recos.level === "none") ? (
            <>
              <button className="reco-magic" disabled={!canSearch} style={{ ...s.recoBtn, ...(canSearch ? {} : { opacity: 0.5, cursor: "default" }) }} onClick={runRecos}>
                {recoInner()}
              </button>
              <div style={s.detailBox}>
                <div style={s.dHead}>
                  <span style={{ ...s.dTag, background: CARD_TAG.unfit.bg, color: CARD_TAG.unfit.text }}>
                    <span style={{ ...s.dTagDot, background: CARD_TAG.unfit.dot }} />추천 없음
                  </span>
                  <div style={s.dTitle}>잡을 수 있는 시간이 없어요</div>
                  <div style={s.dSub}>
                    <span style={{ ...s.dSubDot, background: CARD_TAG.unfit.dot }} />
                    <span style={s.dSubText}>{deadEnd ? `이 기간엔 최대 ${deadEnd.freeCount}/${deadEnd.total}명만 맞아요${deadEnd.missing && deadEnd.missing.length ? ` · ${deadEnd.missing.slice(0, 3).map(nameOf).join(", ")}님이 계속 겹쳐요` : ""}` : "조건을 만족하는 빈 시간이 없어요"}</span>
                  </div>
                </div>
                <div style={s.dDivider} />
                <div style={s.recoTips}>
                  <div style={s.recoTip}><span style={s.recoTipDot} />기간을 더 넓혀보세요</div>
                  <div style={s.recoTip}><span style={s.recoTipDot} />필수 참석자를 선택으로 바꿔보세요</div>
                  <div style={s.recoTip}><span style={s.recoTipDot} />참석자를 줄이거나 온라인으로 바꿔보세요</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <button className="reco-magic" disabled={!canSearch} style={{ ...s.recoBtn, ...(canSearch ? {} : { opacity: 0.5, cursor: "default" }) }} onClick={runRecos}>
                {recoInner()}
              </button>
              <div style={s.emptyRight}>
                <div style={s.emptyGroup}>
                  <img src="/icons/empty-blocks.svg" width="50" height="47" alt="" />
                  <div style={s.emptyTextCol}>
                    <span style={s.emptyTitle}>선택한 시간이 없어요</span>
                    <span style={s.emptyDesc}>빈 시간을 클릭하거나 추천 시간을 찾아보세요</span>
                  </div>
                </div>
              </div>
            </>
          )}

        </aside>
        <div style={{ ...s.rightThumb, top: rThumb.top, height: rThumb.h, opacity: rThumb.show ? 1 : 0 }} />
        </div>
      </div>
      {askOpen && (
        <div style={s.modalBackdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) setAskOpen(false); }}>
          <div style={s.modalCard} role="dialog" aria-modal="true">
            <div style={s.modalHead}>
              <span style={s.modalTitle}>동료에게 물어보기</span>
              <button style={s.modalClose} onClick={() => setAskOpen(false)} aria-label="닫기">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="#6B7684" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div style={s.askSection}>
              <div style={s.askSecLabel}>
                <span>참석자 <span style={s.askSecCount}>{askIds.length}명</span></span>
                <button style={s.askAllBtn} onClick={toggleAskAll}>{askIds.length === participants.length ? "전체 해제" : "전체 선택"}</button>
              </div>
              <div style={s.askList}>
                {participants.map((p) => {
                  const on = askIds.includes(p.id);
                  return (
                    <button key={p.id} style={s.askRow} onClick={() => toggleAskId(p.id)}>
                      <Avatar id={p.id} box={s.askAvatar} />
                      <span style={s.askName}>{nameOf(p.id)}{p.id === "me" ? " (나)" : ""}</span>
                      <span style={{ ...s.askCheck, ...(on ? s.askCheckOn : {}) }}>{on && <img src="/icons/check.svg" width="11" height="11" alt="" />}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={s.askSection}>
              <div style={s.askSecLabel}><span>메시지</span></div>
              <textarea className="mss field" style={s.askTextarea} value={askMsg} onChange={(e) => setAskMsg(e.target.value)} placeholder="물어볼 내용을 적어주세요" />
            </div>
            <button style={{ ...s.primaryBtn, ...(askIds.length ? {} : { background: "#C9E2FF", cursor: "default" }) }} disabled={!askIds.length} onClick={sendAsk}>보내기</button>
          </div>
        </div>
      )}
      {askToast && (
        <div style={s.askToast}>
          <span style={s.askToastIcon}><Icon.check style={{ color: "#FFF", width: 12, height: 12 }} /></span>
          <span style={s.askToastText}>일정 조율 메시지를 보냈어요.</span>
        </div>
      )}
    </div>
  );
}

// 토스 스타일 날짜 피커 (하루 또는 기간 선택)
function MiniCalendar({ month, setMonth, draft, onPick, onConfirm, onClose }) {
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1);
  const startDow = first.getDay(); // 0=일
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ d: new Date(y, m, 1 - (startDow - i)), out: true });
  for (let day = 1; day <= daysInMonth; day++) cells.push({ d: new Date(y, m, day), out: false });
  while (cells.length % 7 !== 0) { const last = cells[cells.length - 1].d; cells.push({ d: addDays(last, 1), out: true }); }
  const todayStr = ymd(TODAY);
  // 과제 핵심 플로우 범위: 13일 이전·25일 이후는 막음
  const allowedEndStr = ymd(addDays(TODAY, 12));
  const sStr = draft.start ? ymd(draft.start) : null;
  const eStr = draft.end ? ymd(draft.end) : null;

  return (
    <div style={ms.pop} onClick={(e) => e.stopPropagation()}>
      <div style={ms.popTitle}>하루 또는 기간 선택</div>
      <div style={ms.head}>
        <span style={ms.title}>{y}년 {m + 1}월</span>
        <div style={ms.navs}>
          <button style={ms.nav} onClick={() => setMonth(new Date(y, m - 1, 1))}><img src="/icons/cal-prev.svg" width="20" height="20" alt="이전 달" /></button>
          <button style={ms.nav} onClick={() => setMonth(new Date(y, m + 1, 1))}><img src="/icons/cal-next.svg" width="20" height="20" alt="다음 달" /></button>
        </div>
      </div>
      <div style={ms.dowRow}>
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <span key={i} style={{ ...ms.dow, color: i === 0 ? "#F04452" : "#4E5968" }}>{w}</span>
        ))}
      </div>
      <div style={ms.grid}>
        {cells.map(({ d, out }, i) => {
          const ds = ymd(d);
          const isPast = ds < todayStr;
          const isToday = ds === todayStr;
          const dow = d.getDay();
          const blocked = ds > allowedEndStr;
          const disabled = out || isPast || blocked;
          const isStart = sStr && ds === sStr;
          const isEnd = eStr && ds === eStr;
          const inRange = sStr && eStr && ds > sStr && ds < eStr;
          const endpoint = isStart || isEnd || (sStr && !eStr && ds === sStr);
          const hasBand = sStr && eStr && (isStart || isEnd || inRange);
          const band = hasBand ? {
            background: T.blueBg,
            borderTopLeftRadius: isStart || dow === 0 ? 999 : 0,
            borderBottomLeftRadius: isStart || dow === 0 ? 999 : 0,
            borderTopRightRadius: isEnd || dow === 6 ? 999 : 0,
            borderBottomRightRadius: isEnd || dow === 6 ? 999 : 0,
          } : {};
          return (
            <button key={i} disabled={disabled} onClick={() => onPick(d)}
              style={{ ...ms.cellWrap, ...band, cursor: disabled ? "default" : "pointer" }}>
              <span style={{
                ...ms.cellInner,
                color: disabled ? "#B0B8C1" : "#4E5968",
                ...(endpoint ? ms.cellInnerOn : {}),
              }}>{d.getDate()}</span>
              {isToday && !endpoint && <span style={ms.todayDot} />}
            </button>
          );
        })}
      </div>
      <div style={ms.footer}>
        <button disabled={!draft.start} onClick={onConfirm}
          style={{ ...ms.confirmBtn, ...(draft.start ? {} : ms.confirmBtnOff) }}>확인</button>
      </div>
    </div>
  );
}

function Row({ label, value, tone }) {
  const color = tone === "warn" ? "#FB8800" : tone === "danger" ? "#E42939" : "#4E5968";
  return (
    <div style={s.kvRow}>
      <span style={s.kvLabel}>{label}</span>
      <span style={{ ...s.kvValue, color }}>{value}</span>
    </div>
  );
}
function AdjustToggle({ on, onClick, title, desc, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...s.adjustRow, borderColor: on ? T.blue : T.gray200, background: on ? T.blueBgSoft : T.white, opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer" }}>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={s.adjustTitle}>{title}</div>
        <div style={s.adjustDesc}>{desc}</div>
      </div>
      <span style={{ ...s.switch, ...(on ? s.switchOn : {}) }}><span style={{ ...s.switchKnob, ...(on ? s.switchKnobOn : {}) }} /></span>
    </button>
  );
}

const globalCss = `
* { box-sizing: border-box; }
button { font-family: inherit; border: none; background: none; color: inherit; text-align: inherit; cursor: pointer; padding: 0; }
input { font-family: inherit; }
input::placeholder, textarea::placeholder { color: #B0B8C1; opacity: 1; }
::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-thumb { background: ${T.gray300}; border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }
/* 자동 숨김 스크롤바: 평소엔 투명(공간은 유지→레이아웃 안 밀림), 스크롤 중에만 표시 */
.mss::-webkit-scrollbar { width: 8px; height: 8px; }
.mss::-webkit-scrollbar-track { background: transparent; }
.mss::-webkit-scrollbar-thumb { background: transparent; border-radius: 8px; transition: background .3s ease; }
.mss.mss-on::-webkit-scrollbar-thumb { background: ${T.gray300}; }
.mss { scrollbar-width: thin; scrollbar-color: transparent transparent; }
.mss.mss-on { scrollbar-color: ${T.gray300} transparent; }
/* 캘린더 스크롤: 스크롤바가 레이아웃 공간을 예약하지 않게(좌우 패딩 대칭) — 스크롤은 그대로 동작 */
.cal-scroll { scrollbar-width: none; }
.cal-scroll::-webkit-scrollbar { width: 0; height: 0; }
/* 입력 필드: 굵기 1px 고정(텍스트 안 밀림). hover·focus는 box-shadow 링으로 동일하게 더 두껍게 보이게 — 평소 회색, hover 파란 50%, focus 파란. 모든 필드 동일 */
.field { border-width: 1px; border-color: #E5E8EB; transition: border-color .15s ease, box-shadow .15s ease; }
.field:hover:not(:focus) { border-color: rgba(49,130,246,0.5); box-shadow: 0 0 0 1px rgba(49,130,246,0.5); }
.field:focus { border-color: #3182F6; box-shadow: 0 0 0 1px #3182F6; }
/* 우측 추천 패널: 네이티브 스크롤바는 공간을 안 먹게 숨기고(좌우 패딩 대칭 유지), 커스텀 오버레이 thumb를 위에 얹는다 */
.mss.mss-noscroll::-webkit-scrollbar { width: 0; height: 0; }
.mss.mss-noscroll { scrollbar-width: none; }
.mss.mss-noscroll::after { content: ""; display: block; height: 34px; flex: 0 0 auto; } /* 스크롤 끝에서도 아래 여백 확보(패딩 collapse 회피) */
button:focus-visible:not(.field) { outline: 2px solid ${T.blue}; outline-offset: 1px; }
.emp-row:hover:not(:disabled) { background: ${T.gray50} !important; }
.cand-block:hover { filter: brightness(0.955); }
/* 추천 계산 로딩: 버튼 배경 파도(좌→우 연·진) + 점 로더 + 결과 드롭다운 열림 */
.reco-magic { position: relative; overflow: hidden; background: #fff; }
.reco-loading { background: linear-gradient(#FFFFFF, #FFFFFF) padding-box, linear-gradient(90deg, #E5E8EB 0%, #B6E0FF 25%, #7CBEFF 50%, #B6E0FF 75%, #E5E8EB 100%) border-box; background-size: 200% 100%, 200% 100%; animation: recoBorderWave 2.4s linear infinite; }
@keyframes recoBorderWave { from { background-position: 200% 0, 200% 0; } to { background-position: -200% 0, -200% 0; } }
@keyframes toastDrop { from { transform: translate(-50%, -180%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.reco-tag-grad { background: linear-gradient(90deg, #558BFF, #00B7FF); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; font-size: 13px; font-weight: 700; letter-spacing: -0.26px; line-height: 18px; }
.reco-headline-grad { background: linear-gradient(90deg, #49669A, #21354D 49%, #4174AB); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
/* 참석자 칩 제외(×) 버튼 hover */
.att-badge { transition: background .15s ease, border-color .15s ease, color .15s ease, transform .18s cubic-bezier(0.34,1.56,0.64,1); }
.att-badge:active { transform: scale(0.90); }
.att-badge-req { background: #3182F6; color: #FFF; border: 1px solid #3182F6; }
.att-badge-req:hover { background: #2272EB; border-color: #2272EB; }
.att-badge-opt { background: #FFF; color: #2272EB; border: 1.5px solid #3182F6; }
.att-badge-opt:hover { background: #F0F6FF; }
.att-x { color: #B0B8C1; background: transparent; transition: color .15s ease, background .15s ease; }
.att-x:hover { background: #E5E8EB; color: #98A2B3; }
/* 헤더 네비 탭 hover */
.rz-handle { position: absolute; top: 0; bottom: 0; width: 9px; cursor: url('/cursors/resize.svg') 13 8, col-resize; z-index: 40; display: flex; align-items: center; justify-content: center; }
.rz-handle::before { content: ""; width: 3px; height: 46px; border-radius: 3px; background: transparent; transition: background .15s ease; }
.rz-handle:hover::before { background: #A6BEE0; }
.info-tip { position: relative; display: inline-flex; align-items: center; margin-left: -1px; }
.info-tip img { display: block; cursor: pointer; }
.info-bubble { white-space: nowrap; background: #fff; color: #4E5968; font-size: 12px; font-weight: 600; letter-spacing: -0.24px; line-height: 15px; padding: 9px 14px; border-radius: 10px; box-shadow: 0 4px 20px rgba(176,184,193,0.34); z-index: 60; }
.info-bubble::before { content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 6px solid transparent; border-top-color: #fff; }
.nav-item { background: transparent; transition: background .15s ease; }
.nav-item:hover { background: #F2F4F6; }
/* 오프라인/온라인 탭: 누를 때 텍스트가 살짝 작아지는 눌림 피드백 */
.method-tab:active { transform: scale(0.92); }
/* 드롭다운 열림: 아래로 부드럽게 펼쳐짐(접힘은 즉시). 애니 후 max-height는 none으로 복귀 → 잘림 없음 */
.reco-open { animation: recoOpen .42s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: top center; }
@keyframes recoOpen { 0% { opacity: 0; max-height: 0; } 60% { opacity: 1; } 100% { opacity: 1; max-height: 720px; } }
.dept-item:hover { background: #F2F4F6 !important; }
.cell:hover { filter: brightness(0.98); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const FONT = '"Pretendard", "Pretendard Variable", -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif';
const s = {
  app: { fontFamily: FONT, color: T.ink, background: T.gray50, height: "100vh", display: "flex", flexDirection: "column", fontSize: 13, WebkitFontSmoothing: "antialiased" },
  header: { height: 56, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", background: T.white, borderBottom: "1px solid #E9EBEE", flexShrink: 0 },
  headerLeft: { display: "flex", alignItems: "center", gap: 18 },
  iconBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "none", padding: 0 },
  nav: { display: "flex", gap: 4, paddingLeft: 8 },
  navItem: { fontFamily: FONT, color: "#4E5968", fontSize: 15, fontWeight: 600, lineHeight: "19px", letterSpacing: -0.3, padding: "8px 12px 9px", borderRadius: 8, cursor: "pointer", border: "none" },
  navActive: { color: "#3182F6" },

  body: { flex: 1, display: "grid", gridTemplateColumns: "288px minmax(0, 1fr) clamp(300px, 30vw, 344px)", gridTemplateRows: "minmax(0, 1fr)", minHeight: 0 },

  left: { borderRight: `1px solid ${T.gray100}`, padding: "20px 18px", overflowY: "auto", background: T.white, display: "flex", flexDirection: "column" },
  panelTitle: { fontSize: 19, fontWeight: 800, letterSpacing: -0.4, marginBottom: 18 },
  fieldLabel: { fontSize: 12.5, fontWeight: 600, color: T.gray500, display: "block", marginBottom: 7 },
  formTop: { display: "flex", flexDirection: "column", gap: 16, width: "100%" },
  inputWrap: { position: "relative", width: "100%" },
  clearBtn: { position: "absolute", right: 15, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, borderRadius: "50%", background: "#8B95A1", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 },
  input: { width: "100%", height: 46, borderStyle: "solid", borderRadius: 12, padding: "0 15px", fontSize: 13, letterSpacing: -0.26, background: T.white, color: T.gray700, fontWeight: 500, boxSizing: "border-box", outline: "none" },
  inputWarn: { borderColor: "#F04452" },
  titleWarnMsg: { padding: "0 4px", fontFamily: FONT, fontSize: 12, fontWeight: 500, lineHeight: "14px", letterSpacing: -0.24, color: "#F04452" },
  fieldRow: { display: "flex", gap: 10 },
  timeWrap: { position: "relative", marginBottom: 8 },
  durationRow: { fontSize: 12, color: T.gray500, fontWeight: 600, marginBottom: 14, display: "flex", gap: 6, alignItems: "center" },
  durChips: { display: "flex", gap: 5, width: "100%" },
  durChip: { flex: 1, minWidth: 0, height: 36, borderRadius: 9, background: T.gray100, color: T.gray700, fontWeight: 700, fontSize: 11, letterSpacing: -0.5, cursor: "pointer", whiteSpace: "nowrap", padding: 0, textAlign: "center" },
  durChipOn: { background: T.blue, color: "#FFF" },
  methodTabs: { position: "relative", display: "flex", gap: 3, background: "#F2F4F6", borderRadius: 10, padding: 3, width: "100%" },
  methodInd: { position: "absolute", top: 3, left: 3, bottom: 3, width: "calc((100% - 9px) / 2)", borderRadius: 7, background: T.white, boxShadow: "0 1px 1px rgba(0,0,0,0.1)", transition: "transform .28s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 0 },
  methodTab: { position: "relative", zIndex: 1, flex: 1, borderRadius: 7, background: "transparent", color: "#8B95A1", fontWeight: 700, fontSize: 14, lineHeight: "16px", letterSpacing: -0.28, cursor: "pointer", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", transition: "color .2s ease, transform .13s ease", border: "none" },
  methodTabOn: { color: "#333D4B" },
  durMenu: { position: "absolute", top: 42, left: 0, right: 0, background: "#FFF", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.14)", border: `1px solid ${T.gray100}`, padding: 4, zIndex: 30, minWidth: 96 },
  durMenuItem: { width: "100%", textAlign: "left", padding: "9px 11px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: T.gray700, cursor: "pointer", whiteSpace: "nowrap" },
  durationVal: { color: T.ink, fontWeight: 800 },
  timeSelect: { width: "100%", height: 46, border: "none", borderRadius: 12, padding: "0 30px 0 12px", fontSize: 13.5, background: T.gray100, color: T.ink, fontWeight: 600, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", textOverflow: "ellipsis" },
  timeChevron: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "inline-flex", pointerEvents: "none" },
  dateField: { width: "100%", height: 46, borderRadius: 12, borderStyle: "solid", outline: "none", padding: "0 15px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.white, fontWeight: 500, color: "#4E5968", cursor: "pointer", textAlign: "left", boxSizing: "border-box" },
  periodHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  modeToggle: { display: "flex", background: T.gray100, borderRadius: 8, padding: 2, gap: 2 },
  modeBtn: { fontSize: 11.5, fontWeight: 700, color: T.gray500, padding: "4px 11px", borderRadius: 6, cursor: "pointer" },
  modeBtnOn: { background: T.white, color: T.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
  divider: { height: 1, background: T.gray100, margin: "20px 0" },
  panelSubhead: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
  panelTitle2: { fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: "#47515F" },
  counterPill: { fontSize: 14, fontWeight: 800, color: T.blue },
  counterMax: { color: "#B0B8C1", fontWeight: 700 },
  partSection: { display: "flex", flexDirection: "column", gap: 16, width: "100%", flex: 1, minHeight: 0 },
  partBody: { display: "flex", flexDirection: "column", gap: 16, width: "100%", flex: 1, minHeight: 0 },
  partFields: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  searchWrap: { position: "relative", width: "100%" },
  searchIcon: { position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", display: "inline-flex" },
  searchInput: { width: "100%", height: 46, borderStyle: "solid", borderRadius: 12, padding: "0 15px 0 37px", fontSize: 14, letterSpacing: -0.28, background: T.white, color: T.gray700, fontWeight: 500, boxSizing: "border-box", outline: "none" },
  deptWrap: { position: "relative", width: "100%" },
  deptTrigger: { width: "100%", height: 46, borderStyle: "solid", borderRadius: 12, padding: "0 15px", fontSize: 14, letterSpacing: -0.28, background: T.white, color: T.gray700, fontWeight: 500, cursor: "pointer", outline: "none", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" },
  deptMenu: { position: "absolute", top: 50, left: 0, width: "100%", background: T.white, borderRadius: 10, padding: 4, boxShadow: "0 2px 5px rgba(52,59,87,0.16)", zIndex: 41, display: "flex", flexDirection: "column", gap: 4, boxSizing: "border-box" },
  deptTriggerText: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  deptItem: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 400, color: T.gray700, letterSpacing: -0.26, lineHeight: "18px" },
  deptItemSel: { fontWeight: 600, color: T.blue },
  empList: { display: "flex", flexDirection: "column", gap: 4, width: "100%", overflowY: "auto", flex: 1, minHeight: 80 },
  empRow: { width: "100%", height: 56, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left" },
  checkbox: { width: 20, height: 20, borderRadius: 7, borderWidth: 2, borderStyle: "solid", borderColor: T.gray300, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxOn: { background: T.blue, borderColor: T.blue },
  avatar: { width: 40, height: 40, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: T.gray700, letterSpacing: -0.26, flexShrink: 0 },
  empInfo: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 },
  empName: { fontWeight: 700, fontSize: 14, letterSpacing: -0.28, color: "#333D4B", display: "flex", alignItems: "center", gap: 2 },
  meTag: { fontSize: 12, fontWeight: 700, color: T.gray500, letterSpacing: -0.24 },
  empMeta: { color: T.gray500, fontSize: 12, letterSpacing: -0.24, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  center: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden", padding: "16px 20px 24px", gap: 12, background: T.white },
  attendeeBar: { padding: "2px 2px 4px" },
  attendeeBarTitle: { fontSize: 14, fontWeight: 700, color: T.gray700, display: "flex", alignItems: "center", gap: 6, marginBottom: 12, letterSpacing: -0.28, lineHeight: "16px" },
  attCount: { display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 3, fontSize: 13, fontWeight: 600, letterSpacing: -0.26 },
  attCountReq: { color: "#3182F6" },
  attCountOpt: { color: "#8B95A1" },
  attCountDot: { color: "#C9CDD2" },
  attX: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, lineHeight: 0, marginLeft: 2, marginRight: -2 },
  attBadge: { boxSizing: "border-box", width: 34, height: 21, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: 0.2, lineHeight: "normal", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" },
  attendeeChips: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  attChip: { display: "flex", alignItems: "center", gap: 4, background: T.gray50, borderRadius: 8, padding: "5px 7px 5px 9px" },
  attName: { fontWeight: 700, fontSize: 12, lineHeight: "14px", letterSpacing: -0.24, color: "#4E5968" },
  reqToggle: { borderRadius: 16, fontSize: 11, fontWeight: 800, padding: "4px 10px", cursor: "pointer", letterSpacing: 0.2 },
  reqOn: { background: T.blue, color: "#FFF" },
  reqOff: { background: T.gray200, color: T.gray500 },
  toggle: { position: "relative", width: 45, height: 23, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, boxSizing: "border-box", transition: "background .22s ease" },
  toggleText: { position: "absolute", left: 5, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "#FFF", letterSpacing: 0.2, lineHeight: "normal", whiteSpace: "nowrap", pointerEvents: "none", transition: "opacity .18s ease" },
  toggleTextOff: { position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "#B0B8C1", letterSpacing: 0.2, lineHeight: "normal", whiteSpace: "nowrap", pointerEvents: "none", transition: "opacity .18s ease" },
  toggleThumb: { position: "absolute", top: "50%", transform: "translateY(-50%)", borderRadius: "50%", background: "#FFF", boxShadow: "0px 1px 2px rgba(0,0,0,0.1)", transition: "left .22s cubic-bezier(0.4, 0, 0.2, 1), width .22s ease, height .22s ease" },
  toggleThumbOn: { left: 25, width: 17, height: 17 },
  toggleThumbOff: { left: 5, width: 13, height: 13 },
  emptyHint: { color: T.gray400, fontSize: 13 },
  calWrap: { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", background: T.white, display: "flex", flexDirection: "column" },
  calHeadRow: { display: "grid", position: "sticky", top: 0, background: T.gray50, zIndex: 30 },
  calDayHead: { padding: "11px 0", display: "flex", alignItems: "center", justifyContent: "center", containerType: "inline-size" },
  calDayText: { fontSize: "clamp(9px, 18cqi, 13.5px)", fontWeight: 600, letterSpacing: -0.3, whiteSpace: "nowrap" },
  calBody: { display: "grid", position: "relative" },
  calAxis: { position: "relative" },
  calAxisLabel: { position: "absolute", left: 10, fontSize: 11, color: T.gray500, fontWeight: 500, transform: "translateY(-50%)", whiteSpace: "nowrap" },
  calCol: { position: "relative" },
  evBlock: { position: "absolute", left: 3, right: 3, background: T.gray100, borderRadius: 6, padding: "3px 8px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 0, lineHeight: 1.2, textAlign: "left" },
  evBlockTitle: { fontSize: 10.5, fontWeight: 700, color: T.gray500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  evBlockWho: { fontSize: 9.5, color: T.gray400, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  candBlock: { position: "absolute", left: 3, right: 3, borderRadius: 7, padding: "7px 9px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 5, overflow: "hidden", zIndex: 2, textAlign: "left" },
  candBlockDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 4 },
  candDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  candBlockLabel: { fontSize: 10, fontWeight: 800, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  legend: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: T.gray500, fontWeight: 600, paddingLeft: 4, flexShrink: 0 },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 13, height: 13, borderRadius: 5 },

  rightWrap: { position: "relative", minHeight: 0, display: "flex", flexDirection: "column" },
  rightThumb: { position: "absolute", right: 3, width: 6, borderRadius: 3, background: "rgba(96,105,120,0.4)", pointerEvents: "none", transition: "opacity .35s ease", zIndex: 6 },
  right: { flex: 1, minHeight: 0, borderLeft: `1px solid ${T.gray100}`, padding: 18, overflowY: "auto", background: T.gray100, display: "flex", flexDirection: "column", gap: 10 },
  diagBox: { borderRadius: 18, padding: 18 },
  diagTop: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  diagBig: { fontSize: 46, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2 },
  diagBigLabel: { fontSize: 13, color: T.gray500, fontWeight: 700, lineHeight: 1.35 },
  diagTopSmall: { display: "flex", alignItems: "center", gap: 9, marginBottom: 7 },
  diagCheckBadge: { width: 26, height: 26, borderRadius: "50%", background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  diagInfoBadge: { width: 26, height: 26, borderRadius: "50%", background: T.gray400, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  diagHeadlineGood: { fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: -0.3, wordBreak: "keep-all" },
  diagHeadline: { fontSize: 15.5, fontWeight: 800, lineHeight: 1.45, marginBottom: 6, letterSpacing: -0.3, wordBreak: "keep-all" },
  diagDetail: { fontSize: 12.5, color: T.gray500, lineHeight: 1.55, fontWeight: 500, wordBreak: "keep-all" },
  deadEndSecondary: { width: "100%", height: 42, background: "transparent", color: T.gray500, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 8, borderRadius: 10, textDecoration: "underline", textUnderlineOffset: 3, textAlign: "center" },
  recoIconWrap: { width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  recoTextWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  recoGain: { color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 11.5 },
  diagStats: { display: "flex", gap: 14, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.05)", fontSize: 12, color: T.gray500, fontWeight: 600 },
  diagStat: { display: "flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" },
  diagStatDot: { width: 7, height: 7, borderRadius: "50%" },
  hintBox: { fontSize: 13, color: T.gray500, lineHeight: 1.6, padding: 18, background: T.gray50, borderRadius: 16, fontWeight: 500, display: "flex", gap: 10, alignItems: "flex-start", wordBreak: "keep-all" },
  emptyRight: { flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 190 },
  emptyRightInner: { display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingBottom: 100 },
  emptyGroup: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  recoAlt: { width: "100%", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 14, cursor: "pointer", textAlign: "left" },
  recoAltInfo: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
  recoAltHeadRow: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  recoAltChip: { flexShrink: 0, padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 700, lineHeight: "14px", letterSpacing: -0.22 },
  recoAltTime: { fontSize: 14, fontWeight: 700, letterSpacing: -0.28, color: "#333D4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  recoAltReason: { fontSize: 12, fontWeight: 500, letterSpacing: -0.24, color: T.gray500 },
  recoTips: { display: "flex", flexDirection: "column", gap: 9 },
  recoTip: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, letterSpacing: -0.26, color: T.gray700 },
  recoTipDot: { width: 3, height: 3, borderRadius: "50%", background: T.gray400, flexShrink: 0 },
  emptyTextCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" },
  emptyTitle: { fontFamily: FONT, fontSize: 14, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28, color: "#4E5968", textAlign: "center", wordBreak: "keep-all" },
  emptyDesc: { fontFamily: FONT, fontSize: 12, fontWeight: 400, lineHeight: "14px", letterSpacing: -0.24, color: "#4E5968", textAlign: "center", wordBreak: "keep-all" },
  recoBtn: { width: "100%", flexShrink: 0, minHeight: 43, padding: "12px 0", borderRadius: 10, color: T.blue, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: -0.28, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 },
  // Figma geometry (button 308) scaled ×0.854 to the app's 263px button so the glow keeps Figma's centered-arc / white-sides proportion
  recoGlowBot: { position: "absolute", right: -10.2, bottom: -76.9, width: 282.6, height: 93.1, borderRadius: 283, background: "rgba(197,238,255,0.7)", filter: "blur(14.48px)", pointerEvents: "none", zIndex: 1 },
  recoGlowTop: { position: "absolute", left: -38.4, top: -77.7, width: 339.9, height: 93.1, borderRadius: 340, background: "rgba(93,123,255,0.196)", filter: "blur(14.48px)", pointerEvents: "none", zIndex: 2 },
  recoInset: { position: "absolute", inset: 0, borderRadius: 10, boxShadow: "inset 0px 6px 13.5px 0px #fff, inset 0px -3px 20px 0px #fff", pointerEvents: "none", zIndex: 5 },
  recoStar: { position: "relative", zIndex: 4, width: 14, height: 14, flexShrink: 0, display: "block" },
  recoLabel: { position: "relative", zIndex: 4, color: "#335078", fontWeight: 700, fontSize: 14, lineHeight: "16px", letterSpacing: -0.28, whiteSpace: "nowrap" },
  premiumCard: { position: "relative", isolation: "isolate", flexShrink: 0, overflow: "hidden", background: T.white, border: "0.8px solid #E3E9F5", borderRadius: 18, padding: 19, display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch", boxShadow: "0 0 0 1px #F2F4F6" },
  accCard: { position: "relative", isolation: "isolate", overflow: "hidden", width: "100%", flexShrink: 0, background: T.white, border: "0.8px solid #E3E9F5", borderRadius: 18, padding: "14px 18px 16px 18px", boxShadow: "0 0 0 1px #F2F4F6", cursor: "pointer", textAlign: "left", display: "block" },
  accColInner: { display: "flex", flexDirection: "column", gap: 4, width: "100%" },
  accColTitle: { fontSize: 13, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28 },
  accColLabel: { fontSize: 12, fontWeight: 700, lineHeight: "18px", letterSpacing: -0.26, color: "#64A8FF" },
  premiumTop: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
  premiumTag: { display: "flex", alignItems: "center", gap: 4 },
  premiumCollapse: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 2, border: "none", background: "none", cursor: "pointer" },
  premiumHeadlineBase: { fontSize: 17, fontWeight: 800, lineHeight: "24px", letterSpacing: -0.34 },
  premiumHeadline: { fontSize: 17, fontWeight: 800, lineHeight: "24px", letterSpacing: -0.34, color: "#333D4B" },
  premiumTime: { fontSize: 16, fontWeight: 700, lineHeight: "18px", letterSpacing: -0.32, color: "#333D4B" },
  unfitWho: { background: T.gray50, borderRadius: 12, padding: 14, marginBottom: 16 },
  unfitWhoLabel: { fontSize: 12, color: T.gray500, fontWeight: 700, marginBottom: 10 },
  unfitRow: { display: "flex", alignItems: "center", gap: 9, marginBottom: 8 },
  unfitName: { fontWeight: 700, fontSize: 13.5, flexShrink: 0 },
  unfitOptTag: { fontSize: 10.5, fontWeight: 700, color: T.gray500, background: T.gray100, padding: "1px 7px", borderRadius: 6, flexShrink: 0 },
  unfitEvent: { fontSize: 12, color: T.gray500, fontWeight: 600, marginLeft: "auto", background: T.white, padding: "3px 9px", borderRadius: 8 },
  detailBox: { background: T.white, border: "1px solid #F2F4F6", borderRadius: 18, padding: 19, display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch" },
  dHead: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", width: "100%" },
  dTag: { alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, lineHeight: "14px", letterSpacing: -0.24 },
  dTagDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  dTitle: { fontSize: 17, fontWeight: 800, lineHeight: "24px", letterSpacing: -0.34, color: "#191F28" },
  dSub: { display: "flex", gap: 6, alignItems: "flex-start", width: "100%" },
  dSubDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0, marginTop: 6 },
  dSubText: { fontSize: 13, fontWeight: 500, lineHeight: "18px", letterSpacing: -0.26, color: "#4E5968", wordBreak: "keep-all" },
  dDivider: { height: 1, background: "#F2F4F6", width: "100%" },
  dRows: { display: "flex", flexDirection: "column", gap: 6, width: "100%" },
  kvRow: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 10 },
  kvLabel: { fontSize: 13, fontWeight: 700, lineHeight: "18px", letterSpacing: -0.26, color: "#8B95A1", flexShrink: 0 },
  kvValue: { fontSize: 13, fontWeight: 700, lineHeight: "18px", letterSpacing: -0.26, textAlign: "right" },
  roomList: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  btnCol: { display: "flex", flexDirection: "column", gap: 6, width: "100%" },
  roomRow: { width: "100%", display: "flex", alignItems: "center", gap: 11, borderWidth: 1, borderStyle: "solid", borderRadius: 12, padding: "11px 13px", cursor: "pointer", textAlign: "left" },
  roomThumb: { width: 48, height: 48, borderRadius: 8, background: "#F2F4F6", overflow: "hidden", flexShrink: 0 },
  roomInfo: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 },
  roomNameRow: { display: "flex", alignItems: "center", gap: 6 },
  roomBadge: { fontSize: 11, fontWeight: 700, lineHeight: "13px", letterSpacing: -0.22, color: "#8B95A1", background: "#F2F4F6", padding: "2px 6px", borderRadius: 5, flexShrink: 0 },
  roomRadio: { width: 20, height: 20, borderRadius: "50%", borderWidth: 2, borderStyle: "solid", borderColor: "#D1D6DB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" },
  roomRadioOn: { background: T.blue, borderColor: T.blue },
  roomName: { fontSize: 14, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28, color: "#333D4B", whiteSpace: "nowrap" },
  roomMeta: { fontSize: 12, fontWeight: 500, lineHeight: "14px", letterSpacing: -0.24, color: "#8B95A1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  noRoomNote: { fontSize: 13, color: STATUS.adjust.text, background: STATUS.adjust.bg, borderRadius: 12, padding: 13, lineHeight: 1.55, fontWeight: 500, wordBreak: "keep-all" },
  solveLabel: { fontSize: 13, fontWeight: 800, color: T.ink, margin: "2px 0 10px", letterSpacing: -0.2 },
  solveBtn: { width: "100%", display: "flex", alignItems: "center", gap: 11, background: T.blue, borderRadius: 14, padding: "13px 14px", cursor: "pointer", textAlign: "left" },
  solveIconWrap: { width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  solveTextWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  solveTitle: { color: "#FFF", fontWeight: 800, fontSize: 14, letterSpacing: -0.3 },
  solveDesc: { color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 11.5, wordBreak: "keep-all" },
  solveFootnote: { fontSize: 11.5, color: T.gray500, fontWeight: 500, lineHeight: 1.5, marginTop: 10, wordBreak: "keep-all" },
  askDivider: { height: 1, background: T.gray100, margin: "16px 0" },
  askNote: { display: "flex", gap: 9, background: T.blueBgSoft, borderRadius: 12, padding: "12px 13px", alignItems: "flex-start" },
  askNoteIcon: { flexShrink: 0, marginTop: 1 },
  askNoteText: { fontSize: 12.5, color: T.gray700, fontWeight: 500, lineHeight: 1.55, wordBreak: "keep-all" },
  primaryBtn: { width: "100%", padding: "15px 0", background: T.blue, color: "#FFF", borderRadius: 13, fontWeight: 700, fontSize: 14, lineHeight: "16px", letterSpacing: -0.28, textAlign: "center" },
  copyBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "15px 0", background: "#E8F3FF", borderRadius: 13, cursor: "pointer" },
  copyBtnText: { fontSize: 14, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28, color: "#3182F6" },
  onlineBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "15px 0", background: "#F2F4F6", borderRadius: 13, cursor: "pointer" },
  onlineBtnText: { fontSize: 14, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28, color: "#4E5968" },
  busyBox: { background: "#F9FAFB", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, width: "100%" },
  busyLabel: { fontSize: 12, fontWeight: 700, lineHeight: "14px", letterSpacing: -0.24, color: "#8B95A1" },
  busyList: { display: "flex", flexDirection: "column", gap: 10, width: "100%" },
  busyRow: { display: "flex", alignItems: "center", gap: 8, width: "100%" },
  busyAvatar: { width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.gray700, flexShrink: 0 },
  busyName: { fontSize: 14, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28, color: "#191F28" },
  busyEvent: { fontSize: 11, fontWeight: 600, lineHeight: "13px", letterSpacing: -0.22, color: "#8B95A1", marginLeft: "auto", textAlign: "right" },
  ghostBtn: { width: "100%", height: 46, background: T.gray100, color: T.gray700, borderRadius: 13, fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 14, textAlign: "center" },
  adjustBox: { borderRadius: 18, padding: 18, background: T.gray50, marginTop: "auto" },
  adjustToggleHead: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" },
  chevron: { fontSize: 16, color: T.gray400, fontWeight: 700, transition: "transform .15s" },
  adjustRow: { width: "100%", display: "flex", alignItems: "center", gap: 10, border: "1.5px solid", borderRadius: 13, padding: "12px 13px", marginBottom: 8, background: T.white },
  adjustTitle: { fontWeight: 800, fontSize: 13.5, marginBottom: 3, letterSpacing: -0.2 },
  adjustDesc: { fontSize: 12, color: T.gray500, lineHeight: 1.45, fontWeight: 500 },
  switch: { width: 38, height: 23, borderRadius: 20, background: T.gray300, position: "relative", flexShrink: 0, transition: "background .15s" },
  switchOn: { background: T.blue },
  switchKnob: { width: 19, height: 19, borderRadius: "50%", background: "#FFF", position: "absolute", top: 2, left: 2, transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },
  switchKnobOn: { left: 17 },
  confirmBox: { background: T.white, border: "1px solid #F2F4F6", borderRadius: 18, padding: "23px 19px 19px", display: "flex", flexDirection: "column", gap: 20, alignItems: "stretch" },
  infoTop: { display: "flex", flexDirection: "column", gap: 16, width: "100%", alignItems: "flex-start" },
  infoHead: { display: "flex", alignItems: "center", gap: 10, width: "100%" },
  infoBack: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, border: "none", background: "none", cursor: "pointer", padding: 0 },
  infoHeadTitle: { fontSize: 16, fontWeight: 800, lineHeight: "18px", letterSpacing: -0.32, color: "#333D4B" },
  infoSummary: { display: "flex", flexDirection: "column", gap: 7, width: "100%" },
  infoFields: { display: "flex", flexDirection: "column", gap: 16, width: "100%" },
  infoField: { display: "flex", flexDirection: "column", gap: 6, width: "100%" },
  infoLabel: { fontSize: 13, fontWeight: 500, lineHeight: "18px", letterSpacing: -0.26, color: "#333D4B", padding: "0 2px" },
  memoInput: { width: "100%", height: 80, borderStyle: "solid", borderRadius: 12, padding: "15px", fontSize: 13, letterSpacing: -0.26, color: T.gray700, fontWeight: 500, fontFamily: FONT, resize: "none", outline: "none", boxSizing: "border-box", lineHeight: "16px" },
  // 동료에게 물어보기 모달
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(25,31,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 },
  modalCard: { width: 380, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", background: T.white, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 18, boxSizing: "border-box", boxShadow: "0 12px 48px rgba(25,31,40,0.24)" },
  modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 17, fontWeight: 700, letterSpacing: -0.34, color: "#191F28" },
  modalClose: { background: "none", border: "none", cursor: "pointer", padding: 4, margin: -4, display: "flex", alignItems: "center", justifyContent: "center" },
  askSection: { display: "flex", flexDirection: "column", gap: 9, width: "100%" },
  askSecLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, fontWeight: 600, letterSpacing: -0.26, color: "#333D4B" },
  askSecCount: { color: "#3182F6", fontWeight: 700 },
  askAllBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, letterSpacing: -0.24, color: "#6B7684", padding: "2px 4px" },
  askList: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 6px", maxHeight: 208, overflowY: "auto", margin: "0 -4px", padding: "0 4px" },
  askRow: { display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 10, background: T.gray50, border: "none", cursor: "pointer", width: "100%", textAlign: "left", minWidth: 0 },
  askAvatar: { width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.gray700, letterSpacing: -0.2, flexShrink: 0 },
  askName: { flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, letterSpacing: -0.26, color: "#333D4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  askCheck: { width: 18, height: 18, borderRadius: 6, borderWidth: 2, borderStyle: "solid", borderColor: T.gray300, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  askCheckOn: { background: T.blue, borderColor: T.blue },
  askTextarea: { width: "100%", height: 128, borderStyle: "solid", borderRadius: 12, padding: "13px 15px", fontSize: 13, letterSpacing: -0.26, color: T.gray700, fontWeight: 500, fontFamily: FONT, resize: "none", outline: "none", boxSizing: "border-box", lineHeight: "20px" },
  askToast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 2000, display: "flex", alignItems: "center", gap: 8, background: T.white, padding: 14, borderRadius: 100, boxShadow: "0 4px 10px rgba(176,184,193,0.34)", whiteSpace: "nowrap", animation: "toastDrop .42s cubic-bezier(.16,.84,.34,1.12) both" },
  askToastIcon: { width: 20, height: 20, borderRadius: 10, background: "#00C478", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  askToastText: { fontSize: 15, fontWeight: 600, lineHeight: "18px", letterSpacing: -0.32, color: "#333D4B" },
  fileAdd: { display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start", padding: "8.5px 15.5px 8.5px 11.5px", border: "1px dashed #E5E8EB", borderRadius: 8, background: T.white, color: "#B0B8C1", fontSize: 12, fontWeight: 400, lineHeight: "14px", letterSpacing: -0.24, cursor: "pointer", fontFamily: FONT },
  fileChip: { display: "flex", alignItems: "center", gap: 6, padding: "7px 8px 7px 10px", background: T.gray50, borderRadius: 8 },
  fileName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "#4E5968", letterSpacing: -0.26, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fileX: { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", padding: 2, flexShrink: 0 },
  confirmHead: { display: "flex", flexDirection: "column", gap: 12, alignItems: "center", width: "100%" },
  confirmIcon: { width: 40, height: 40, borderRadius: 20, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  confirmTitle: { fontSize: 18, fontWeight: 800, letterSpacing: -0.4, color: "#191F28", textAlign: "center" },
  confirmCard: { background: "#F9FAFB", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 14, width: "100%" },
  confirmName: { fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: "#191F28" },
  confirmCardDivider: { height: 1, background: "#AFB8C2", opacity: 0.2, width: "100%" },
  calIconBox: { width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  confirmRows: { display: "flex", flexDirection: "column", gap: 10, width: "100%" },
  confirmRow: { display: "flex", gap: 14, alignItems: "center", width: "100%" },
  confirmRowText: { flex: 1, minWidth: 0, wordBreak: "keep-all", overflowWrap: "break-word", fontSize: 13, fontWeight: 700, lineHeight: "18px", letterSpacing: -0.26, color: "#4E5968" },
  secondaryBtn: { width: "100%", padding: "15px 0", background: "#E8F3FF", borderRadius: 13, fontSize: 14, fontWeight: 700, lineHeight: "16px", letterSpacing: -0.28, color: "#3182F6", cursor: "pointer", textAlign: "center" },
};

// 날짜 피커(드롭다운) 스타일 — 날짜 필드 바로 아래, 필드 폭에 맞춰 뜬다
const ms = {
  pop: { position: "absolute", top: 54, left: 0, right: 0, zIndex: 41, background: "#FFF", borderRadius: 14, padding: 14, boxShadow: "0 10px 15px rgba(0,0,0,0.16)" },
  popTitle: { fontSize: 13, fontWeight: 700, letterSpacing: -0.26, color: "#333D4B", marginBottom: 8 },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 13, fontWeight: 600, letterSpacing: -0.26, color: "#333D4B" },
  navs: { display: "flex", gap: 12, alignItems: "center" },
  nav: { width: 20, height: 20, border: "none", background: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  dowRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 },
  dow: { textAlign: "center", fontSize: 11, fontWeight: 400, padding: "3px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 },
  cellWrap: { position: "relative", height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", padding: 0 },
  cellInner: { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 400 },
  cellInnerOn: { background: T.blue, color: "#FFF", fontWeight: 400 },
  todayDot: { position: "absolute", top: 1, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: T.blue },
  footer: { display: "flex", justifyContent: "flex-end", marginTop: 12 },
  confirmBtn: { background: T.blue, color: "#FFF", fontWeight: 700, fontSize: 13, letterSpacing: -0.26, padding: "8px 16px", borderRadius: 9, cursor: "pointer", border: "none" },
  confirmBtnOff: { background: "#C9E2FF", cursor: "default" },
};
