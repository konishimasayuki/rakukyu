// ============================================================
// CONSTANTS
// ============================================================
const COMPANIES = {
  a:       { id:"a",       name:"デモ株式会社",                 address:"東京都〇〇区1-2-3",      tel:"03-0000-0000", password:"a" },
  carsera: { id:"carsera", name:"カーセラ株式会社",             address:"東京都渋谷区〇〇1-2-3",  tel:"03-1234-5678", password:"carsera123" },
  engine:  { id:"engine",  name:"エンジンオートサービス株式会社", address:"大阪府大阪市〇〇4-5-6", tel:"06-9876-5432", password:"engine123" },
};

const EMPLOYMENT_TYPES = ["正社員","パート","アルバイト","契約社員","役員"];

// 社会保険料率（令和6年度）
const RATES = {
  healthInsurance: 0.0998/2,
  nursingCare:     0.0182/2,
  welfarePension:  0.183/2,
  employmentInsurance: 0.006,
};

// ============================================================
// DEFAULT COMPANY SETTINGS（設定タブで変更可能）
// ============================================================
const DEFAULT_SETTINGS = {
  companyName:    "",
  companyAddress: "",
  companyTel:     "",
  companyEmail:   "",
  closingDay:     25,       // 締め日
  paymentDay:     25,       // 支払日
  paymentMonth:   "same",   // same=当月 / next=翌月
  workDaysPerMonth: 20,     // 所定労働日数
  workHoursPerDay:  8,      // 1日所定労働時間
  overtimeRate:     1.25,   // 普通残業率
  lateNightRate:    1.50,   // 深夜残業率
  holidayRate:      1.35,   // 休日残業率
  payTypes: ["月給制","日給月給制","日給制","時間給制"],  // 使用する支給形態
  withholdingPayType: "monthly",  // monthly=毎月納付 / special=納期特例（半年）
  departments: ["営業部","整備部","管理部","受付","経営"],
  incentiveMasters: [
    { id:"inc_1", name:"営業インセンティブ", taxable:true },
    { id:"inc_2", name:"皆勤手当",           taxable:true },
    { id:"inc_3", name:"資格手当",           taxable:true },
    { id:"inc_4", name:"役職手当",           taxable:true },
    { id:"inc_5", name:"残業奨励金",         taxable:true },
  ],
};

// ============================================================
// CALC HELPERS
// ============================================================

export { COMPANIES, EMPLOYMENT_TYPES, RATES, DEFAULT_SETTINGS };
