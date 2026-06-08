import { useState, useMemo, useEffect, useCallback, useRef } from "react";

// ============================================================
// CONSTANTS
// ============================================================
// スーパー管理者
const SUPER_ADMIN = { id:"rakukyu", password:"2911" };

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
// ============================================================
// REDIS API HELPERS
// ============================================================
const API_BASE = "/api";

async function redisGet(key) {
  try {
    const res = await fetch(`${API_BASE}/data?key=${encodeURIComponent(key)}`);
    const json = await res.json();
    return json.value;
  } catch(e) { console.error("redisGet error:", e); return null; }
}

async function redisSet(key, value) {
  try {
    await fetch(`${API_BASE}/data?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } catch(e) { console.error("redisSet error:", e); }
}

async function loadCompaniesFromRedis() {
  try {
    const res = await fetch(`${API_BASE}/companies`);
    const json = await res.json();
    return json.value;
  } catch(e) { return null; }
}

async function saveCompaniesToRedis(companies) {
  try {
    await fetch(`${API_BASE}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companies }),
    });
  } catch(e) { console.error("saveCompanies error:", e); }
}


const fmt = (n) => (n||0).toLocaleString("ja-JP");

function calcBonusAmount(emp, bonusAmount) {
  const social = calcSocialInsurance(bonusAmount, emp.age||35, emp.employmentType, emp.insuranceFlags||null);
  const incomeTax = Math.floor(bonusAmount * 0.042);
  const totalDeduction = social.health+social.nursing+social.pension+social.employment+incomeTax;
  return { bonusAmount, ...social, incomeTax, totalDeduction, netBonus: bonusAmount - totalDeduction };
}

function calcIncomeTax(taxableIncome, dependents=0) {
  const base = taxableIncome - dependents*38000;
  if (base<=0)       return 0;
  if (base<=162500)  return Math.floor(base*0.05);
  if (base<=325000)  return Math.floor(base*0.1-8125);
  if (base<=650000)  return Math.floor(base*0.2-40625);
  if (base<=1000000) return Math.floor(base*0.23-60000);
  return Math.floor(base*0.33-160000);
}

function calcSocialInsurance(salary, age=35, employmentType="正社員", insuranceFlags=null) {
  // insuranceFlagsが指定されている場合はそちらを優先
  const hasHealth   = insuranceFlags ? insuranceFlags.healthInsurance   : (employmentType!=="パート"&&employmentType!=="アルバイト");
  const hasPension  = insuranceFlags ? insuranceFlags.welfarePension    : (employmentType!=="パート"&&employmentType!=="アルバイト");
  const hasEmploy   = insuranceFlags ? insuranceFlags.employmentInsurance: true;
  return {
    health:     hasHealth  ? Math.floor(salary*RATES.healthInsurance) : 0,
    nursing:    hasHealth && age>=40 ? Math.floor(salary*RATES.nursingCare) : 0,
    pension:    hasPension ? Math.floor(salary*RATES.welfarePension)  : 0,
    employment: hasEmploy  ? Math.floor(salary*RATES.employmentInsurance) : 0,
  };
}

// attendance: { workDays, absentDays, paidLeaveDays, scheduledHours, actualHours, overtime, lateNight, holiday }
function calcPayroll(emp, month, settings, incentiveMasters=[], monthlyIncentives={}, attendance=null) {
  const payType    = emp.payType || "月給制";
  const isPT       = emp.employmentType==="パート"||emp.employmentType==="アルバイト";
  const isJikyu    = payType==="時間給制" || isPT;
  const isNikkyuTsuki = payType==="日給月給制";
  const isNikkyu   = payType==="日給制";

  const scheduledDays  = settings.workDaysPerMonth || 20;
  const scheduledHours = settings.workHoursPerDay  || 8;
  const wh = scheduledHours * scheduledDays;  // 月所定時間

  // 日額（日給制・日給月給制）
  const dailyWage  = emp.dailyWage  || 0;
  // 時給（時間給制・パート）
  const hourlyWage = emp.hourlyWage || 0;
  // 月給ベース
  const baseSalary = emp.baseSalary || 0;

  // -------- 基本給の計算 --------
  let calcBase = 0;
  if (isJikyu) {
    // 時間給制：実労働時間 × 時給
    const actualH = attendance?.actualHours || emp.monthlyHours || 0;
    calcBase = Math.floor(hourlyWage * actualH);
  } else if (isNikkyu) {
    // 日給制：出勤日数 × 日給
    const workDays = attendance?.workDays || scheduledDays;
    calcBase = Math.floor(dailyWage * workDays);
  } else if (isNikkyuTsuki) {
    // 日給月給制：欠勤控除あり（1日単価 × 欠勤日数 を月給から引く）
    const absentDays  = attendance?.absentDays  || 0;
    const dailyBase   = Math.floor(baseSalary / scheduledDays);
    calcBase = Math.max(0, baseSalary - dailyBase * absentDays);
  } else {
    // 月給制：固定
    calcBase = baseSalary;
  }

  // -------- 残業代の計算 --------
  let overtimePay = 0;
  if (isJikyu) {
    // 時間給制は上の calcBase に含まれるので残業代は別途
    const baseHourly = hourlyWage;
    overtimePay = Math.floor(
      baseHourly * settings.overtimeRate * (attendance?.overtime  || 0) +
      baseHourly * settings.lateNightRate* (attendance?.lateNight || 0) +
      baseHourly * settings.holidayRate  * (attendance?.holiday   || 0)
    );
  } else if (isNikkyu) {
    // 日給制の残業：日給÷所定時間 が時間単価
    const baseHourly = Math.floor(dailyWage / scheduledHours);
    overtimePay = Math.floor(
      baseHourly * settings.overtimeRate * (attendance?.overtime  || 0) +
      baseHourly * settings.lateNightRate* (attendance?.lateNight || 0) +
      baseHourly * settings.holidayRate  * (attendance?.holiday   || 0)
    );
  } else {
    // 月給制・日給月給制の残業：月給÷月所定時間 が時間単価
    const baseHourly = baseSalary / wh;
    if (attendance) {
      overtimePay = Math.floor(
        baseHourly * settings.overtimeRate * (attendance.overtime  || 0) +
        baseHourly * settings.lateNightRate* (attendance.lateNight || 0) +
        baseHourly * settings.holidayRate  * (attendance.holiday   || 0)
      );
    } else {
      overtimePay = Math.floor(baseHourly * settings.overtimeRate * (emp.overtimeHours || 0));
    }
  }

  const transportAllowance = emp.transportAllowance||0;
  const housingAllowance   = emp.housingAllowance||0;
  const otherAllowance     = emp.otherAllowance||0;

  const empInc = monthlyIncentives[emp.id]||{};
  const enabledIds = emp.enabledIncentives||[];
  const incentiveItems = incentiveMasters
    .filter(m=>enabledIds.includes(m.id))
    .map(m=>({ id:m.id, name:m.name, taxable:m.taxable, amount:empInc[m.id]||0 }));
  const incentiveTotal    = incentiveItems.reduce((s,i)=>s+i.amount,0);
  const incentiveNonTax   = incentiveItems.filter(i=>!i.taxable).reduce((s,i)=>s+i.amount,0);

  const grossSalary = calcBase+overtimePay+transportAllowance+housingAllowance+otherAllowance+incentiveTotal;
  const social = calcSocialInsurance(calcBase, emp.age||35, emp.employmentType, emp.insuranceFlags||null);
  const socialTotal = social.health+social.nursing+social.pension+social.employment;
  const taxable = grossSalary-transportAllowance-incentiveNonTax-social.health-social.nursing-social.pension;
  const incomeTax  = calcIncomeTax(taxable, emp.dependents||0);
  const residentTax = emp.residentTax||0;
  const totalDeduction = socialTotal+incomeTax+residentTax;
  const netSalary = grossSalary-totalDeduction;

  return {
    grossSalary, baseSalary:calcBase, overtimePay, payType, transportAllowance, housingAllowance, otherAllowance,
    incentiveItems, incentiveTotal,
    health:social.health, nursing:social.nursing, pension:social.pension, employment:social.employment,
    socialTotal, incomeTax, residentTax, totalDeduction, netSalary, month,
  };
}

// ============================================================
// PDF HELPERS
// ============================================================
function printPayslip(emp, p, settings, att) {
  const w = window.open("","_blank");
  att = att||{};
  const isPT = p.payType==="時間給制"||emp.employmentType==="パート"||emp.employmentType==="アルバイト";
  const attCells = [
    ["出勤",   att.workDays!=null?att.workDays+"日":"—",false],
    ["欠勤",   att.absentDays!=null?att.absentDays+"日":"—",false],
    ["有給",   att.paidLeaveDays!=null?att.paidLeaveDays+"日":"—",false],
    ["所定時間",att.scheduledHours!=null?att.scheduledHours+"h":"—",false],
    ["実働時間",att.actualHours!=null?att.actualHours+"h":"—",false],
    ["普通残業",att.overtime!=null?att.overtime+"h":"—", att.overtime>0],
    ["深夜残業",att.lateNight!=null?att.lateNight+"h":"—", att.lateNight>0],
    ["休日残業",att.holiday!=null?att.holiday+"h":"—", att.holiday>0],
  ].map(([l,v,ot])=>`<div class="att-cell"><div class="att-label">${l}</div><div class="att-val${ot?" ot":""}">${v}</div></div>`).join("");
  const incRows = p.incentiveItems.filter(i=>i.amount>0).map(i=>
    `<div class="row"><span class="row-label">${i.name}${i.taxable?"":" ★非課税"}</span><span class="row-val">¥${i.amount.toLocaleString()}</span></div>`
  ).join("");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>給与明細書</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'MS Gothic','Hiragino Kaku Gothic ProN',monospace;font-size:11px;color:#111;padding:20px}
.page{max-width:210mm;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:14px}
.co-name{font-size:14px;font-weight:bold}.co-info{font-size:10px;color:#555;line-height:1.8}
.emp-bar{background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:8px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:16px;font-size:11px}
.section-title{font-size:10px;font-weight:bold;color:#6c63ff;letter-spacing:.15em;border-bottom:2px solid #6c63ff;padding-bottom:4px;margin-bottom:8px;margin-top:12px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ddd;font-size:11px}
.row:last-child{border-bottom:none}
.row-label{color:#555;flex:1}.row-val{font-weight:bold;text-align:right;white-space:nowrap}
.total-row{display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #1a1a2e;font-weight:bold;margin-top:4px}
.net-box{background:#1a1a2e;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:4px;margin-top:14px}
.net-label{font-size:12px;color:#aaa}.net-val{font-size:24px;font-weight:900;color:#00c9a7}
.att-bar{background:#f8f9ff;border:1px solid #e0e4f0;border-radius:4px;padding:8px 0;margin-bottom:12px;display:flex;flex-wrap:wrap}
.att-cell{display:flex;flex-direction:column;align-items:center;padding:4px 12px;border-right:1px solid #e0e4f0;min-width:70px}
.att-cell:last-child{border-right:none}.att-label{font-size:9px;color:#999;margin-bottom:2px}
.att-val{font-size:12px;font-weight:bold}.att-val.ot{color:#fc5c65}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
th{background:#1a1a2e;color:white;padding:5px 6px;text-align:left;white-space:nowrap}
td{border:1px solid #ccc;padding:4px 6px;white-space:nowrap}
.r{text-align:right}.bold{font-weight:bold}.green{color:#00796b}.red{color:#c62828}
.summary{background:#fffbe6;border:1px solid #f7b731;border-radius:4px;padding:12px 16px;margin-top:12px}
.refund-box{padding:10px 16px;border-radius:4px;text-align:center}
.refund-box.refund{background:#e8faf5;border:2px solid #00c9a7}
.refund-box.extra{background:#fff0f0;border:2px solid #fc5c65}
.refund-amount{font-size:22px;font-weight:900}
.seal-area{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.seal{width:50px;height:50px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center}
@media print{button{display:none!important}}
</style></head><body><div class="page">
  <div class="header">
    <div><div class="co-name">${settings.companyName||""}</div>
    <div class="co-info">${settings.companyAddress||""}&nbsp;&nbsp;TEL: ${settings.companyTel||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:bold;letter-spacing:.2em">給 与 明 細 書</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${p.month.replace("-","年")}月分</div>
    </div>
  </div>
  <div class="emp-bar">
    <div><b>${emp.name}</b>&nbsp;様</div>
    <div>コード：${emp.code||"—"}</div>
    <div>部署：${emp.department}</div>
    <div>雇用形態：${emp.employmentType}（${emp.payType||"月給制"}）</div>
    ${emp.address?`<div>住所：${emp.address}</div>`:""}
  </div>
  <div class="section-title">勤 怠 情 報</div>
  <div class="att-bar">${attCells}</div>
  <div class="two-col">
    <div>
      <div class="section-title">支 給</div>
      <div class="row"><span class="row-label">${isPT?"賃金（時給×実働）":"基本給"}</span><span class="row-val">¥${p.baseSalary.toLocaleString()}</span></div>
      ${p.overtimePay>0?`<div class="row"><span class="row-label">時間外手当</span><span class="row-val">¥${p.overtimePay.toLocaleString()}</span></div>`:""}
      ${p.transportAllowance>0?`<div class="row"><span class="row-label">通勤手当</span><span class="row-val">¥${p.transportAllowance.toLocaleString()}</span></div>`:""}
      ${p.housingAllowance>0?`<div class="row"><span class="row-label">住宅手当</span><span class="row-val">¥${p.housingAllowance.toLocaleString()}</span></div>`:""}
      ${p.otherAllowance>0?`<div class="row"><span class="row-label">その他手当</span><span class="row-val">¥${p.otherAllowance.toLocaleString()}</span></div>`:""}
      ${incRows}
      <div class="total-row"><span>総支給額</span><span style="color:#00796b">¥${p.grossSalary.toLocaleString()}</span></div>
    </div>
    <div>
      <div class="section-title">控 除</div>
      ${p.health>0?`<div class="row"><span class="row-label">健康保険料</span><span class="row-val">¥${p.health.toLocaleString()}</span></div>`:""}
      ${p.nursing>0?`<div class="row"><span class="row-label">介護保険料</span><span class="row-val">¥${p.nursing.toLocaleString()}</span></div>`:""}
      ${p.pension>0?`<div class="row"><span class="row-label">厚生年金保険料</span><span class="row-val">¥${p.pension.toLocaleString()}</span></div>`:""}
      ${p.employment>0?`<div class="row"><span class="row-label">雇用保険料</span><span class="row-val">¥${p.employment.toLocaleString()}</span></div>`:""}
      ${p.incomeTax>0?`<div class="row"><span class="row-label">所得税</span><span class="row-val">¥${p.incomeTax.toLocaleString()}</span></div>`:""}
      ${p.residentTax>0?`<div class="row"><span class="row-label">住民税</span><span class="row-val">¥${p.residentTax.toLocaleString()}</span></div>`:""}
      <div class="total-row"><span>控除合計</span><span style="color:#c62828">¥${p.totalDeduction.toLocaleString()}</span></div>
    </div>
  </div>
  <div class="net-box">
    <span class="net-label">差引支給額（手取り）</span>
    <span class="net-val">¥${p.netSalary.toLocaleString()}</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </div></body></html>`);
  w.document.close();
}
// ============================================================
// 賃金台帳PDF共通CSS
// ============================================================
const LEDGER_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'MS Gothic','Hiragino Kaku Gothic ProN',monospace;font-size:10px;color:#111;padding:16px}
table{width:100%;border-collapse:collapse;margin-bottom:10px}
th{background:#1a1a2e;color:white;padding:5px 4px;text-align:left;white-space:nowrap;font-size:8px}
td{border:1px solid #ccc;padding:3px 5px;white-space:nowrap;font-size:9px}
.r{text-align:right}.bold{font-weight:bold}.green{color:#00796b}.red{color:#c62828}
.bonus-row{background:#fff8e1}.bonus-total{background:#fff3cd;font-weight:bold;border-top:2px solid #f7b731}
.salary-total{background:#e8f0ff;font-weight:bold;border-top:2px solid #6c63ff}
.grand-total{background:#1a1a2e;color:white;font-weight:bold;border-top:2px solid #333}
.grand-total td{color:white}
@media print{button{display:none!important}}`;

function ledgerHeader(settings, title, subtitle) {
  return `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div>
    <div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:15px;font-weight:bold;letter-spacing:.2em">${title}</div>
      <div style="font-size:11px;color:#666">${subtitle}</div>
    </div>
  </div>`;
}

function printLedger(employees, month, settings, incentiveMasters, mi, attendanceData) {
  const rows = employees.map(e=>({ e, p:calcPayroll(e,month,settings,incentiveMasters,mi,attendanceData[e.id]) }));
  const tot = rows.reduce((a,{p})=>({
    g:a.g+p.grossSalary,d:a.d+p.totalDeduction,n:a.n+p.netSalary,i:a.i+p.incentiveTotal,
    h:a.h+p.health,nu:a.nu+p.nursing,pe:a.pe+p.pension,em:a.em+p.employment,
    it:a.it+p.incomeTax,rt:a.rt+p.residentTax
  }),{g:0,d:0,n:0,i:0,h:0,nu:0,pe:0,em:0,it:0,rt:0});
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>月別賃金台帳</title><style>${LEDGER_CSS}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div>
    <div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:15px;font-weight:bold;letter-spacing:.2em">月 別 賃 金 台 帳</div>
      <div style="font-size:11px;color:#666">${month.replace("-","年")}月分&nbsp;&nbsp;対象者: ${rows.length}名</div>
    </div>
  </div>
  <table>
  <tr>
    <th>コード</th><th>氏名</th><th>部署</th><th>雇用形態</th><th>支給形態</th>
    <th class="r">基本給</th><th class="r">残業代</th><th class="r">インセン</th><th class="r">各手当</th>
    <th class="r">総支給</th><th class="r">健保</th><th class="r">介護</th><th class="r">厚年</th>
    <th class="r">雇保</th><th class="r">所得税</th><th class="r">住民税</th><th class="r">控除計</th><th class="r">手取り</th>
  </tr>
  ${rows.map(({e,p})=>`<tr>
    <td style="font-size:8px;color:#888">${e.code||"—"}</td><td>${e.name}</td><td>${e.department}</td>
    <td>${e.employmentType}</td><td>${e.payType||"月給制"}</td>
    <td class="r">${p.baseSalary.toLocaleString()}</td>
    <td class="r">${p.overtimePay>0?p.overtimePay.toLocaleString():"—"}</td>
    <td class="r bold">${p.incentiveTotal>0?p.incentiveTotal.toLocaleString():"—"}</td>
    <td class="r">${(p.transportAllowance+p.housingAllowance+p.otherAllowance)>0?(p.transportAllowance+p.housingAllowance+p.otherAllowance).toLocaleString():"—"}</td>
    <td class="r bold green">${p.grossSalary.toLocaleString()}</td>
    <td class="r">${p.health>0?p.health.toLocaleString():"—"}</td>
    <td class="r">${p.nursing>0?p.nursing.toLocaleString():"—"}</td>
    <td class="r">${p.pension>0?p.pension.toLocaleString():"—"}</td>
    <td class="r">${p.employment>0?p.employment.toLocaleString():"—"}</td>
    <td class="r">${p.incomeTax>0?p.incomeTax.toLocaleString():"—"}</td>
    <td class="r">${p.residentTax>0?p.residentTax.toLocaleString():"—"}</td>
    <td class="r red">${p.totalDeduction.toLocaleString()}</td>
    <td class="r bold">${p.netSalary.toLocaleString()}</td>
  </tr>`).join("")}
  <tr style="background:#f0f4ff;font-weight:bold;font-size:9px">
    <td colspan="5">合計（${rows.length}名）</td>
    <td></td><td></td>
    <td class="r">${tot.i.toLocaleString()}</td><td></td>
    <td class="r green">${tot.g.toLocaleString()}</td>
    <td class="r">${tot.h.toLocaleString()}</td><td class="r">${tot.nu.toLocaleString()}</td>
    <td class="r">${tot.pe.toLocaleString()}</td><td class="r">${tot.em.toLocaleString()}</td>
    <td class="r">${tot.it.toLocaleString()}</td><td class="r">${tot.rt.toLocaleString()}</td>
    <td class="r red">${tot.d.toLocaleString()}</td><td class="r">${tot.n.toLocaleString()}</td>
  </tr>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;印刷日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </body></html>`);
  w.document.close();
}

// ============================================================
// 賃金台帳PDF：年次全員
// ============================================================
function printLedgerYearly(employees, year, settings, getMI, getAtt, getBonus) {
  const MONTHS_12 = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);
  const fmtN = n=>(n||0).toLocaleString();
  const rows = employees.map(e=>{
    let sal=0,bon=0,h=0,nu=0,pe=0,em=0,it=0,rt=0,sd=0,bd=0;
    MONTHS_12.forEach(m=>{
      const p=calcPayroll(e,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[e.id]);
      sal+=p.grossSalary; h+=p.health; nu+=p.nursing; pe+=p.pension;
      em+=p.employment; it+=p.incomeTax; rt+=p.residentTax; sd+=p.totalDeduction;
      const bAmt=getBonus(m)?.data?.[e.id]?.bonus||0;
      if(bAmt>0){const b=calcBonusAmount(e,bAmt);bon+=b.bonusAmount;h+=b.health;nu+=b.nursing;pe+=b.pension;em+=b.employment;it+=b.incomeTax;bd+=b.totalDeduction;}
    });
    return {e,sal,bon,total:sal+bon,h,nu,pe,em,it,rt,deduct:sd+bd,net:sal+bon-sd-bd};
  });
  const tot=rows.reduce((a,r)=>({sal:a.sal+r.sal,bon:a.bon+r.bon,total:a.total+r.total,h:a.h+r.h,nu:a.nu+r.nu,pe:a.pe+r.pe,em:a.em+r.em,it:a.it+r.it,rt:a.rt+r.rt,deduct:a.deduct+r.deduct,net:a.net+r.net}),{sal:0,bon:0,total:0,h:0,nu:0,pe:0,em:0,it:0,rt:0,deduct:0,net:0});
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>賃金台帳（年次）${year}</title><style>${LEDGER_CSS}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
<div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div><div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
<div style="text-align:right"><div style="font-size:15px;font-weight:bold;letter-spacing:.2em">賃 金 台 帳（年 次）</div>
<div style="font-size:11px;color:#666">${year}年（1〜12月）　対象者: ${rows.length}名</div></div></div>
<table>
<tr><th>コード</th><th>氏名</th><th>部署</th><th>雇用形態</th>
<th class="r">給与支給計</th><th class="r">賞与支給計</th><th class="r">年間総支給</th>
<th class="r">健保計</th><th class="r">介護計</th><th class="r">厚年計</th><th class="r">雇保計</th>
<th class="r">所得税計</th><th class="r">住民税計</th><th class="r">控除合計</th><th class="r">年間手取り</th></tr>
${rows.map(r=>`<tr>
<td style="font-size:8px;color:#888">${r.e.code||"—"}</td><td>${r.e.name}</td><td>${r.e.department}</td><td>${r.e.employmentType}</td>
<td class="r">${fmtN(r.sal)}</td>
<td class="r ${r.bon>0?"bold":""}" style="${r.bon>0?"color:#856404":""}">${r.bon>0?fmtN(r.bon):"—"}</td>
<td class="r bold green">${fmtN(r.total)}</td>
<td class="r">${r.h>0?fmtN(r.h):"—"}</td><td class="r">${r.nu>0?fmtN(r.nu):"—"}</td>
<td class="r">${r.pe>0?fmtN(r.pe):"—"}</td><td class="r">${r.em>0?fmtN(r.em):"—"}</td>
<td class="r">${r.it>0?fmtN(r.it):"—"}</td><td class="r">${r.rt>0?fmtN(r.rt):"—"}</td>
<td class="r red">${fmtN(r.deduct)}</td><td class="r bold">${fmtN(r.net)}</td></tr>`).join("")}
<tr class="grand-total">
<td colspan="4">合計（${rows.length}名）</td>
<td class="r">${fmtN(tot.sal)}</td><td class="r">${fmtN(tot.bon)}</td><td class="r">${fmtN(tot.total)}</td>
<td class="r">${fmtN(tot.h)}</td><td class="r">${fmtN(tot.nu)}</td><td class="r">${fmtN(tot.pe)}</td><td class="r">${fmtN(tot.em)}</td>
<td class="r">${fmtN(tot.it)}</td><td class="r">${fmtN(tot.rt)}</td>
<td class="r">${fmtN(tot.deduct)}</td><td class="r">${fmtN(tot.net)}</td></tr>
</table>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
<div style="font-size:9px;color:#aaa">楽給.com　発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
<button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer">印刷/PDF保存</button>
</div></body></html>`);
  w.document.close();
}

// ============================================================
// 賃金台帳PDF：個人年次（給与月別＋賞与明細）
// ============================================================
function printLedgerEmpYearly(emp, year, settings, getMI, getAtt, getBonus) {
  const MONTHS_12 = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);
  const fmtN = n=>(n||0).toLocaleString();
  const monthData = MONTHS_12.map(m=>{
    const p=calcPayroll(emp,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[emp.id]);
    const bAmt=getBonus(m)?.data?.[emp.id]?.bonus||0;
    const b=bAmt>0?calcBonusAmount(emp,bAmt):null;
    const payDate=getBonus(m)?.payDate||"";
    return {m,p,b,bAmt,payDate};
  });
  const sg=monthData.reduce((a,{p})=>({gross:a.gross+p.grossSalary,h:a.h+p.health,nu:a.nu+p.nursing,pe:a.pe+p.pension,em:a.em+p.employment,it:a.it+p.incomeTax,rt:a.rt+p.residentTax,d:a.d+p.totalDeduction,net:a.net+p.netSalary}),{gross:0,h:0,nu:0,pe:0,em:0,it:0,rt:0,d:0,net:0});
  const bonusMonths=monthData.filter(r=>r.bAmt>0);
  const bg=bonusMonths.reduce((a,{b})=>b?({gross:a.gross+b.bonusAmount,h:a.h+b.health,nu:a.nu+b.nursing,pe:a.pe+b.pension,em:a.em+b.employment,it:a.it+b.incomeTax,d:a.d+b.totalDeduction,net:a.net+b.netBonus}):a,{gross:0,h:0,nu:0,pe:0,em:0,it:0,d:0,net:0});
  const total={gross:sg.gross+bg.gross,h:sg.h+bg.h,nu:sg.nu+bg.nu,pe:sg.pe+bg.pe,em:sg.em+bg.em,it:sg.it+bg.it,rt:sg.rt,d:sg.d+bg.d,net:sg.net+bg.net};
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>賃金台帳（個人）${emp.name} ${year}</title><style>${LEDGER_CSS}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
<div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div><div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
<div style="text-align:right"><div style="font-size:15px;font-weight:bold;letter-spacing:.2em">賃 金 台 帳（個 人 年 次）</div>
<div style="font-size:11px;color:#666">${year}年（1〜12月）　${emp.name}（${emp.code||"—"}）</div></div></div>
<div style="background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:6px 12px;margin-bottom:10px;font-size:10px;display:flex;gap:20px;flex-wrap:wrap">
<span>部署：${emp.department}</span><span>雇用形態：${emp.employmentType}（${emp.payType||"月給制"}）</span>
<span>入社日：${emp.joinDate}</span>${emp.retireDate?`<span style="color:#c62828">退職日：${emp.retireDate}</span>`:""}
</div>
<table>
<tr><th>月</th><th class="r">基本給</th><th class="r">残業代</th><th class="r">インセン</th><th class="r">各手当</th>
<th class="r">総支給</th><th class="r">健保</th><th class="r">介護</th><th class="r">厚年</th>
<th class="r">雇保</th><th class="r">所得税</th><th class="r">住民税</th><th class="r">控除計</th><th class="r">手取り</th></tr>
${monthData.map(({m,p})=>`<tr>
<td style="font-weight:bold">${m.replace("-","年")}月</td>
<td class="r">${fmtN(p.baseSalary)}</td><td class="r">${p.overtimePay>0?fmtN(p.overtimePay):"—"}</td>
<td class="r">${p.incentiveTotal>0?fmtN(p.incentiveTotal):"—"}</td>
<td class="r">${(p.transportAllowance+p.housingAllowance+p.otherAllowance)>0?fmtN(p.transportAllowance+p.housingAllowance+p.otherAllowance):"—"}</td>
<td class="r bold green">${fmtN(p.grossSalary)}</td>
<td class="r">${p.health>0?fmtN(p.health):"—"}</td><td class="r">${p.nursing>0?fmtN(p.nursing):"—"}</td>
<td class="r">${p.pension>0?fmtN(p.pension):"—"}</td><td class="r">${p.employment>0?fmtN(p.employment):"—"}</td>
<td class="r">${p.incomeTax>0?fmtN(p.incomeTax):"—"}</td><td class="r">${p.residentTax>0?fmtN(p.residentTax):"—"}</td>
<td class="r red">${fmtN(p.totalDeduction)}</td><td class="r bold">${fmtN(p.netSalary)}</td></tr>`).join("")}
<tr class="salary-total">
<td>給与合計</td><td class="r">${fmtN(sg.gross)}</td><td></td><td></td><td></td>
<td class="r green">${fmtN(sg.gross)}</td>
<td class="r">${fmtN(sg.h)}</td><td class="r">${fmtN(sg.nu)}</td><td class="r">${fmtN(sg.pe)}</td>
<td class="r">${fmtN(sg.em)}</td><td class="r">${fmtN(sg.it)}</td><td class="r">${fmtN(sg.rt)}</td>
<td class="r red">${fmtN(sg.d)}</td><td class="r bold">${fmtN(sg.net)}</td></tr>
${bonusMonths.map(({m,b,bAmt,payDate})=>`<tr class="bonus-row">
<td style="color:#856404;font-weight:bold">${m.replace("-","年")}月<br><span style="font-size:8px">賞与${payDate?` (${payDate})`:""}</span></td>
<td class="r bold" colspan="4" style="color:#856404">支給額　¥${fmtN(bAmt)}</td>
<td class="r bold" style="color:#856404">${fmtN(bAmt)}</td>
<td class="r">${b.health>0?fmtN(b.health):"—"}</td><td class="r">${b.nursing>0?fmtN(b.nursing):"—"}</td>
<td class="r">${b.pension>0?fmtN(b.pension):"—"}</td><td class="r">${b.employment>0?fmtN(b.employment):"—"}</td>
<td class="r">${b.incomeTax>0?fmtN(b.incomeTax):"—"}</td><td class="r">—</td>
<td class="r red">${fmtN(b.totalDeduction)}</td><td class="r bold">${fmtN(b.netBonus)}</td></tr>`).join("")}
${bg.gross>0?`<tr class="bonus-total">
<td>賞与合計</td><td colspan="4" style="font-size:9px;color:#888">${bonusMonths.length}回分</td>
<td class="r" style="color:#856404">${fmtN(bg.gross)}</td>
<td class="r">${fmtN(bg.h)}</td><td class="r">${fmtN(bg.nu)}</td><td class="r">${fmtN(bg.pe)}</td>
<td class="r">${fmtN(bg.em)}</td><td class="r">${fmtN(bg.it)}</td><td class="r">—</td>
<td class="r red">${fmtN(bg.d)}</td><td class="r bold">${fmtN(bg.net)}</td></tr>`:""}
<tr class="grand-total">
<td>年間合計</td><td colspan="4"></td><td class="r">${fmtN(total.gross)}</td>
<td class="r">${fmtN(total.h)}</td><td class="r">${fmtN(total.nu)}</td><td class="r">${fmtN(total.pe)}</td>
<td class="r">${fmtN(total.em)}</td><td class="r">${fmtN(total.it)}</td><td class="r">${fmtN(total.rt)}</td>
<td class="r">${fmtN(total.d)}</td><td class="r">${fmtN(total.net)}</td></tr>
</table>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
<div style="font-size:9px;color:#aaa">楽給.com　発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
<button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer">印刷/PDF保存</button>
</div></body></html>`);
  w.document.close();
}

// ============================================================
// INITIAL DATA
// ============================================================
const INITIAL_EMPLOYEES = [
  // 営業部（正社員・契約社員）
  { id:1,  code:"EMP001", name:"田中 太郎",   nameKana:"タナカ タロウ",     department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:280000, dailyWage:0, transportAllowance:15000, housingAllowance:20000, otherAllowance:0,    age:42, dependents:2, residentTax:18000, joinDate:"2018-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  { id:2,  code:"EMP002", name:"鈴木 花子",   nameKana:"スズキ ハナコ",     department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:240000, dailyWage:0, transportAllowance:12000, housingAllowance:0,     otherAllowance:5000, age:35, dependents:1, residentTax:14000, joinDate:"2020-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_4"] },
  { id:3,  code:"EMP003", name:"佐藤 次郎",   nameKana:"サトウ ジロウ",     department:"整備部", employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:28, dependents:0, residentTax:0,     joinDate:"2023-01-10", retireDate:"", hourlyWage:1200, monthlyHours:120, enabledIncentives:["inc_2"] },
  { id:4,  code:"EMP004", name:"山田 美咲",   nameKana:"ヤマダ ミサキ",     department:"受付",   employmentType:"契約社員", payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:210000, dailyWage:0, transportAllowance:10000, housingAllowance:0,     otherAllowance:0,    age:30, dependents:0, residentTax:11000, joinDate:"2022-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_5"] },
  { id:5,  code:"EMP005", name:"伊藤 健一",   nameKana:"イトウ ケンイチ",   department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:320000, dailyWage:0, transportAllowance:18000, housingAllowance:20000, otherAllowance:0,    age:45, dependents:3, residentTax:22000, joinDate:"2015-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_4"] },
  { id:6,  code:"EMP006", name:"渡辺 さくら", nameKana:"ワタナベ サクラ",   department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:260000, dailyWage:0, transportAllowance:14000, housingAllowance:0,     otherAllowance:0,    age:31, dependents:0, residentTax:15000, joinDate:"2019-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  { id:7,  code:"EMP007", name:"中村 拓也",   nameKana:"ナカムラ タクヤ",   department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:250000, dailyWage:0, transportAllowance:10000, housingAllowance:15000, otherAllowance:0,    age:33, dependents:1, residentTax:13000, joinDate:"2021-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:8,  code:"EMP008", name:"小林 直美",   nameKana:"コバヤシ ナオミ",   department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:230000, dailyWage:0, transportAllowance:8000,  housingAllowance:0,     otherAllowance:3000, age:38, dependents:2, residentTax:12000, joinDate:"2017-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_4"] },
  { id:9,  code:"EMP009", name:"加藤 雄介",   nameKana:"カトウ ユウスケ",   department:"整備部", employmentType:"正社員",   payType:"日給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:0,      dailyWage:12500, transportAllowance:12000, housingAllowance:0, otherAllowance:0,    age:36, dependents:1, residentTax:16000, joinDate:"2016-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_5"] },
  { id:10, code:"EMP010", name:"吉田 美穂",   nameKana:"ヨシダ ミホ",       department:"受付",   employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:25, dependents:0, residentTax:0,     joinDate:"2023-06-01", retireDate:"", hourlyWage:1100, monthlyHours:100, enabledIncentives:[] },
  { id:11, code:"EMP011", name:"松本 大輔",   nameKana:"マツモト ダイスケ", department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:295000, dailyWage:0, transportAllowance:16000, housingAllowance:20000, otherAllowance:0,    age:40, dependents:2, residentTax:19000, joinDate:"2014-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  { id:12, code:"EMP012", name:"井上 恵子",   nameKana:"イノウエ ケイコ",   department:"管理部", employmentType:"契約社員", payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:200000, dailyWage:0, transportAllowance:9000,  housingAllowance:0,     otherAllowance:0,    age:29, dependents:0, residentTax:10000, joinDate:"2022-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:13, code:"EMP013", name:"木村 俊介",   nameKana:"キムラ シュンスケ", department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:245000, dailyWage:0, transportAllowance:11000, housingAllowance:0,     otherAllowance:0,    age:27, dependents:0, residentTax:12000, joinDate:"2022-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:14, code:"EMP014", name:"林 奈々",     nameKana:"ハヤシ ナナ",       department:"受付",   employmentType:"アルバイト",payType:"時間給制",insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:22, dependents:0, residentTax:0,     joinDate:"2024-01-15", retireDate:"", hourlyWage:1050, monthlyHours:80,  enabledIncentives:[] },
  { id:15, code:"EMP015", name:"清水 博之",   nameKana:"シミズ ヒロユキ",   department:"経営",   employmentType:"役員",     payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:false}, baseSalary:500000, dailyWage:0, transportAllowance:0,     housingAllowance:50000, otherAllowance:0,    age:55, dependents:2, residentTax:45000, joinDate:"2010-01-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_4"] },
  { id:16, code:"EMP016", name:"山口 真理",   nameKana:"ヤマグチ マリ",     department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:255000, dailyWage:0, transportAllowance:13000, housingAllowance:0,     otherAllowance:0,    age:34, dependents:1, residentTax:14000, joinDate:"2020-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  { id:17, code:"EMP017", name:"森 隆",       nameKana:"モリ タカシ",       department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:260000, dailyWage:0, transportAllowance:10000, housingAllowance:15000, otherAllowance:0,    age:39, dependents:2, residentTax:15000, joinDate:"2018-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_5"] },
  { id:18, code:"EMP018", name:"池田 朋子",   nameKana:"イケダ トモコ",     department:"管理部", employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:43, dependents:2, residentTax:0,     joinDate:"2021-09-01", retireDate:"", hourlyWage:1300, monthlyHours:140, enabledIncentives:["inc_2"] },
  { id:19, code:"EMP019", name:"橋本 翔太",   nameKana:"ハシモト ショウタ", department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:235000, dailyWage:0, transportAllowance:12000, housingAllowance:0,     otherAllowance:0,    age:26, dependents:0, residentTax:11000, joinDate:"2023-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1"] },
  { id:20, code:"EMP020", name:"藤田 里奈",   nameKana:"フジタ リナ",       department:"受付",   employmentType:"契約社員", payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:205000, dailyWage:0, transportAllowance:9000,  housingAllowance:0,     otherAllowance:0,    age:28, dependents:0, residentTax:10000, joinDate:"2023-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_2","inc_3"] },
  // 21〜35追加
  { id:21, code:"EMP021", name:"高橋 誠",     nameKana:"タカハシ マコト",   department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:275000, dailyWage:0, transportAllowance:15000, housingAllowance:0,     otherAllowance:0,    age:37, dependents:1, residentTax:16000, joinDate:"2017-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  { id:22, code:"EMP022", name:"岡田 幸子",   nameKana:"オカダ サチコ",     department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:235000, dailyWage:0, transportAllowance:11000, housingAllowance:0,     otherAllowance:0,    age:32, dependents:0, residentTax:13000, joinDate:"2019-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:23, code:"EMP023", name:"斎藤 浩二",   nameKana:"サイトウ コウジ",   department:"整備部", employmentType:"正社員",   payType:"日給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:0,      dailyWage:13000, transportAllowance:10000, housingAllowance:0, otherAllowance:0,    age:34, dependents:0, residentTax:14000, joinDate:"2020-01-06", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:24, code:"EMP024", name:"石川 由美",   nameKana:"イシカワ ユミ",     department:"受付",   employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:40, dependents:1, residentTax:0,     joinDate:"2022-06-01", retireDate:"", hourlyWage:1150, monthlyHours:90,  enabledIncentives:[] },
  { id:25, code:"EMP025", name:"前田 健太",   nameKana:"マエダ ケンタ",     department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:290000, dailyWage:0, transportAllowance:17000, housingAllowance:20000, otherAllowance:0,    age:41, dependents:2, residentTax:19000, joinDate:"2013-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_4"] },
  { id:26, code:"EMP026", name:"後藤 美樹",   nameKana:"ゴトウ ミキ",       department:"管理部", employmentType:"契約社員", payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:215000, dailyWage:0, transportAllowance:10000, housingAllowance:0,     otherAllowance:0,    age:27, dependents:0, residentTax:10000, joinDate:"2023-01-10", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:27, code:"EMP027", name:"長谷川 修",   nameKana:"ハセガワ オサム",   department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:255000, dailyWage:0, transportAllowance:12000, housingAllowance:0,     otherAllowance:0,    age:44, dependents:3, residentTax:17000, joinDate:"2012-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_5"] },
  { id:28, code:"EMP028", name:"村田 彩",     nameKana:"ムラタ アヤ",       department:"受付",   employmentType:"アルバイト",payType:"時間給制",insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:20, dependents:0, residentTax:0,     joinDate:"2024-04-01", retireDate:"", hourlyWage:1080, monthlyHours:60,  enabledIncentives:[] },
  { id:29, code:"EMP029", name:"坂本 隆史",   nameKana:"サカモト タカシ",   department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:265000, dailyWage:0, transportAllowance:14000, housingAllowance:0,     otherAllowance:0,    age:35, dependents:1, residentTax:15000, joinDate:"2018-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1"] },
  { id:30, code:"EMP030", name:"三浦 香織",   nameKana:"ミウラ カオリ",     department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:225000, dailyWage:0, transportAllowance:9000,  housingAllowance:0,     otherAllowance:0,    age:30, dependents:0, residentTax:12000, joinDate:"2021-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_4"] },
  { id:31, code:"EMP031", name:"藤井 勇気",   nameKana:"フジイ ユウキ",     department:"整備部", employmentType:"正社員",   payType:"日給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:0,      dailyWage:11500, transportAllowance:8000,  housingAllowance:0, otherAllowance:0,    age:29, dependents:0, residentTax:12000, joinDate:"2022-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:32, code:"EMP032", name:"西村 律子",   nameKana:"ニシムラ リツコ",   department:"受付",   employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:48, dependents:0, residentTax:0,     joinDate:"2020-03-01", retireDate:"", hourlyWage:1250, monthlyHours:130, enabledIncentives:["inc_2"] },
  { id:33, code:"EMP033", name:"青木 達也",   nameKana:"アオキ タツヤ",     department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:245000, dailyWage:0, transportAllowance:13000, housingAllowance:0,     otherAllowance:0,    age:28, dependents:0, residentTax:12000, joinDate:"2024-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1"] },
  { id:34, code:"EMP034", name:"福田 真奈美", nameKana:"フクダ マナミ",     department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:240000, dailyWage:0, transportAllowance:11000, housingAllowance:0,     otherAllowance:0,    age:33, dependents:1, residentTax:13000, joinDate:"2019-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:35, code:"EMP035", name:"岩田 光則",   nameKana:"イワタ ミツノリ",   department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:270000, dailyWage:0, transportAllowance:12000, housingAllowance:15000, otherAllowance:0,    age:46, dependents:3, residentTax:18000, joinDate:"2011-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_5"] },
  // 36〜50（退職者3名含む）
  { id:36, code:"EMP036", name:"上田 直人",   nameKana:"ウエダ ナオト",     department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:268000, dailyWage:0, transportAllowance:14000, housingAllowance:0,     otherAllowance:0,    age:38, dependents:1, residentTax:15000, joinDate:"2017-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  { id:37, code:"EMP037", name:"内田 優子",   nameKana:"ウチダ ユウコ",     department:"管理部", employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:36, dependents:2, residentTax:0,     joinDate:"2022-01-11", retireDate:"", hourlyWage:1180, monthlyHours:110, enabledIncentives:[] },
  { id:38, code:"EMP038", name:"田村 裕介",   nameKana:"タムラ ユウスケ",   department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:248000, dailyWage:0, transportAllowance:10000, housingAllowance:0,     otherAllowance:0,    age:31, dependents:0, residentTax:13000, joinDate:"2021-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:39, code:"EMP039", name:"小野 麻衣",   nameKana:"オノ マイ",         department:"受付",   employmentType:"契約社員", payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:208000, dailyWage:0, transportAllowance:9000,  housingAllowance:0,     otherAllowance:0,    age:26, dependents:0, residentTax:10000, joinDate:"2023-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_2"] },
  { id:40, code:"EMP040", name:"川口 翼",     nameKana:"カワグチ ツバサ",   department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:282000, dailyWage:0, transportAllowance:16000, housingAllowance:20000, otherAllowance:0,    age:43, dependents:2, residentTax:18000, joinDate:"2016-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_4"] },
  { id:41, code:"EMP041", name:"竹内 文子",   nameKana:"タケウチ フミコ",   department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:228000, dailyWage:0, transportAllowance:10000, housingAllowance:0,     otherAllowance:0,    age:29, dependents:0, residentTax:12000, joinDate:"2022-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:42, code:"EMP042", name:"原 大地",     nameKana:"ハラ ダイチ",       department:"整備部", employmentType:"正社員",   payType:"日給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:0,      dailyWage:12000, transportAllowance:9000,  housingAllowance:0, otherAllowance:0,    age:32, dependents:1, residentTax:13000, joinDate:"2020-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3"] },
  { id:43, code:"EMP043", name:"杉山 智子",   nameKana:"スギヤマ トモコ",   department:"受付",   employmentType:"アルバイト",payType:"時間給制",insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:21, dependents:0, residentTax:0,     joinDate:"2024-02-01", retireDate:"", hourlyWage:1060, monthlyHours:70,  enabledIncentives:[] },
  { id:44, code:"EMP044", name:"横山 大介",   nameKana:"ヨコヤマ ダイスケ", department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:258000, dailyWage:0, transportAllowance:13000, housingAllowance:0,     otherAllowance:0,    age:36, dependents:1, residentTax:14000, joinDate:"2018-04-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1"] },
  { id:45, code:"EMP045", name:"宮崎 千尋",   nameKana:"ミヤザキ チヒロ",   department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:232000, dailyWage:0, transportAllowance:10000, housingAllowance:0,     otherAllowance:0,    age:31, dependents:0, residentTax:12000, joinDate:"2020-07-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_4"] },
  { id:46, code:"EMP046", name:"和田 信也",   nameKana:"ワダ ノブヤ",       department:"整備部", employmentType:"正社員",   payType:"日給月給制",insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:252000, dailyWage:0, transportAllowance:11000, housingAllowance:0,     otherAllowance:0,    age:35, dependents:2, residentTax:14000, joinDate:"2019-01-07", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_3","inc_5"] },
  { id:47, code:"EMP047", name:"石井 京子",   nameKana:"イシイ キョウコ",   department:"受付",   employmentType:"パート",   payType:"時間給制", insuranceFlags:{healthInsurance:false,welfarePension:false,employmentInsurance:true},  baseSalary:0,      dailyWage:0, transportAllowance:0,     housingAllowance:0,     otherAllowance:0,    age:44, dependents:1, residentTax:0,     joinDate:"2021-11-01", retireDate:"", hourlyWage:1120, monthlyHours:95,  enabledIncentives:[] },
  { id:48, code:"EMP048", name:"大野 剛",     nameKana:"オオノ タケシ",     department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:272000, dailyWage:0, transportAllowance:15000, housingAllowance:0,     otherAllowance:0,    age:39, dependents:1, residentTax:16000, joinDate:"2016-10-01", retireDate:"", hourlyWage:0,    monthlyHours:0,   enabledIncentives:["inc_1","inc_2"] },
  // 退職者3名
  { id:49, code:"EMP049", name:"吉川 浩",     nameKana:"ヨシカワ ヒロシ",   department:"営業部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:265000, dailyWage:0, transportAllowance:14000, housingAllowance:0,     otherAllowance:0,    age:52, dependents:2, residentTax:20000, joinDate:"2008-04-01", retireDate:"2024-03-31", hourlyWage:0,    monthlyHours:0,   enabledIncentives:[] },
  { id:50, code:"EMP050", name:"中島 美幸",   nameKana:"ナカジマ ミユキ",   department:"管理部", employmentType:"正社員",   payType:"月給制",   insuranceFlags:{healthInsurance:true, welfarePension:true, employmentInsurance:true},  baseSalary:218000, dailyWage:0, transportAllowance:9000,  housingAllowance:0,     otherAllowance:0,    age:34, dependents:1, residentTax:11000, joinDate:"2019-04-01", retireDate:"2024-05-31", hourlyWage:0,    monthlyHours:0,   enabledIncentives:[] },
];

const INITIAL_ATTENDANCE = {
  "2024-06": {
    1:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:168, overtime:8,  lateNight:0, holiday:0 },
    2:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:163, overtime:3,  lateNight:0, holiday:0 },
    3:  { workDays:18, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:144, overtime:0,  lateNight:0, holiday:0 },
    4:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:160, overtime:0,  lateNight:0, holiday:0 },
    5:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:175, overtime:12, lateNight:3, holiday:0 },
    6:  { workDays:19, absentDays:1, paidLeaveDays:0, scheduledHours:160, actualHours:155, overtime:5,  lateNight:0, holiday:0 },
    7:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:165, overtime:5,  lateNight:0, holiday:8 },
    8:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:162, overtime:2,  lateNight:0, holiday:0 },
    9:  { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:170, overtime:10, lateNight:0, holiday:0 },
    10: { workDays:15, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:100, overtime:0,  lateNight:0, holiday:0 },
    11: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:168, overtime:8,  lateNight:2, holiday:0 },
    12: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:160, overtime:0,  lateNight:0, holiday:0 },
    13: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:164, overtime:4,  lateNight:0, holiday:0 },
    14: { workDays:12, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:80,  overtime:0,  lateNight:0, holiday:0 },
    15: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:160, overtime:0,  lateNight:0, holiday:0 },
    16: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:166, overtime:6,  lateNight:0, holiday:0 },
    17: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:167, overtime:7,  lateNight:0, holiday:8 },
    18: { workDays:18, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:140, overtime:0,  lateNight:0, holiday:0 },
    19: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:162, overtime:2,  lateNight:0, holiday:0 },
    20: { workDays:20, absentDays:0, paidLeaveDays:0, scheduledHours:160, actualHours:161, overtime:1,  lateNight:0, holiday:0 },
  }
};

// ============================================================
// MAIN APP
// ============================================================
export default function PayrollApp() {
  const [company,       setCompany]       = useState(null);
  const [isSuperAdmin,  setIsSuperAdmin]  = useState(false);
  const [companies,     setCompanies]     = useState(COMPANIES); // 会社一覧（追加可能）
  const [loginId,       setLoginId]       = useState("");
  const [loginPw,       setLoginPw]       = useState("");
  const [loginError,    setLoginError]    = useState("");
  const [tab,           setTab]           = useState("dashboard");
  const [employees,     setEmployees]     = useState(INITIAL_EMPLOYEES);
  const saveEmployees = useCallback((emps) => {
    setEmployees(emps);
    if (company) redisSet(`rakukyu:employees:${company.id}`, emps);
  }, [company]);
  const [settings,      setSettings]      = useState(DEFAULT_SETTINGS);
  const saveSettings = useCallback((updater) => {
    setSettings(prev => {
      const next = typeof updater === "function" ? updater(prev) : {...prev,...updater};
      if (company) redisSet(`rakukyu:settings:${company.id}`, next);
      return next;
    });
  }, [company]);
  const [monthlyIncentives, setMonthlyIncentives] = useState({
        "2024-06":{ 
      1:{inc_1:85000,inc_2:10000}, 
      2:{inc_3:15000,inc_4:30000}, 
      3:{inc_2:10000}, 
      4:{inc_1:120000,inc_5:20000},
      5:{inc_1:150000,inc_4:30000},
      6:{inc_1:60000,inc_2:10000},
      7:{inc_3:15000},
      8:{inc_3:15000,inc_4:25000},
      9:{inc_3:15000,inc_5:10000},
      11:{inc_1:95000,inc_2:10000},
      12:{inc_3:15000},
      13:{inc_3:15000},
      16:{inc_1:70000,inc_2:10000},
      17:{inc_3:15000,inc_5:10000},
      18:{inc_2:10000},
      19:{inc_1:40000},
      20:{inc_2:10000,inc_3:15000},
    }
  });
  const [attendanceData, setAttendanceData] = useState(INITIAL_ATTENDANCE);
  const [yearEndData,    setYearEndData]    = useState({});  // { empId: { declarations... } }
  const saveYearEnd = useCallback((updater) => {
    setYearEndData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (company) redisSet(`rakukyu:yearend:${company.id}`, next);
      return next;
    });
  }, [company]);
  const [monthTransport, setMonthTransport] = useState({});   // { empId: amount } 月次通勤手当上書き
  // bonusData: { "2024-06": { payDate:"2024-06-10", data:{ 1:{bonus:300000}, ... } } }
  const [bonusData, setBonusData] = useState({
    "2024-06": { payDate:"2024-06-10", data:{ 1:{bonus:300000}, 5:{bonus:350000}, 11:{bonus:280000}, 15:{bonus:600000}, 25:{bonus:320000} } },
    "2024-12": { payDate:"2024-12-10", data:{ 1:{bonus:320000}, 5:{bonus:380000}, 11:{bonus:300000}, 15:{bonus:650000}, 25:{bonus:340000} } }
  });
  const getBonus  = (m) => bonusData[m]||{payDate:"",data:{}};
  const setBonus  = (m, empId, val) => setBonusData(prev=>{
    const next = {...prev,[m]:{...prev[m],data:{...(prev[m]?.data||{}),[empId]:{bonus:val}}}};
    if (company) redisSet(`rakukyu:bonus:${company.id}:${m}`, next[m]);
    return next;
  });
  const setBonusPayDate = (m, date) => setBonusData(prev=>{
    const next = {...prev,[m]:{...(prev[m]||{data:{}}),payDate:date}};
    if (company) redisSet(`rakukyu:bonus:${company.id}:${m}`, next[m]);
    return next;
  });
  const [selectedMonth, setSelectedMonth] = useState("2024-06");
  const [editingEmp,    setEditingEmp]    = useState(null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [searchText,    setSearchText]    = useState("");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);

  // ============================================================
  // タブ切り替え・画面フォーカス時の再取得（本番: ここでAPIをコール）
  // ============================================================
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [refreshing,  setRefreshing]  = useState(false);
  const refreshCount = useRef(0);

  const refresh = useCallback(async () => {
    if (!company) return;
    setRefreshing(true);
    refreshCount.current += 1;
    try {
      const cid = company.id;
      const [emps, sett] = await Promise.all([
        redisGet(`rakukyu:employees:${cid}`),
        redisGet(`rakukyu:settings:${cid}`),
      ]);
      if (emps)  setEmployees(emps);
      if (sett)  setSettings(s=>({...s,...sett}));
      // 月次データは選択中の月だけ取得
      const [att, inc, bon, ye] = await Promise.all([
        redisGet(`rakukyu:attendance:${cid}:${selectedMonth}`),
        redisGet(`rakukyu:incentives:${cid}:${selectedMonth}`),
        redisGet(`rakukyu:bonus:${cid}:${selectedMonth}`),
        redisGet(`rakukyu:yearend:${cid}`),
      ]);
      if (att) setAttendanceData(prev=>({...prev,[selectedMonth]:att}));
      if (inc) setMonthlyIncentives(prev=>({...prev,[selectedMonth]:inc}));
      if (bon) setBonusData(prev=>({...prev,[selectedMonth]:bon}));
      if (ye)  setYearEndData(ye);
    } catch(e) { console.error("refresh error:", e); }
    setLastRefresh(Date.now());
    setRefreshing(false);
  }, [company, selectedMonth]);

  // visibilitychange: 別タブから戻ってきたとき
  useEffect(()=>{
    const onVisible = () => { if (document.visibilityState==="visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return ()=>document.removeEventListener("visibilitychange", onVisible);
  },[refresh]);

  // windowフォーカス: 別ウィンドウから戻ってきたとき
  useEffect(()=>{
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return ()=>window.removeEventListener("focus", onFocus);
  },[refresh]);

  // ポーリング: 30秒ごとに自動更新（複数人入力を想定）
  useEffect(()=>{
    if (!company) return;
    const timer = setInterval(()=>refresh(), 30000);
    return ()=>clearInterval(timer);
  },[company, refresh]);

  const handleLogin = () => {
    // スーパー管理者チェック
    if (loginId===SUPER_ADMIN.id && loginPw===SUPER_ADMIN.password) {
      setIsSuperAdmin(true);
      setLoginError("");
      // Redisから会社一覧を読み込み
      loadCompaniesFromRedis().then(cos => {
        if (cos) setCompanies(prev=>({...prev,...cos}));
      });
      return;
    }
    // 通常会社ログイン
    const co = companies[loginId];
    if (co && co.password===loginPw) {
      setCompany(co);
      setSettings(s=>({ ...s, companyName:co.name, companyAddress:co.address, companyTel:co.tel }));
      setLoginError("");
      // Redisから初期データ読み込み
      const cid = co.id;
      Promise.all([
        redisGet(`rakukyu:employees:${cid}`),
        redisGet(`rakukyu:settings:${cid}`),
        redisGet(`rakukyu:yearend:${cid}`),
      ]).then(([emps, sett, ye]) => {
        if (emps) setEmployees(emps);
        if (sett) setSettings(s=>({...s,...sett,companyName:co.name,companyAddress:co.address,companyTel:co.tel}));
        if (ye)   setYearEndData(ye);
      });
    } else setLoginError("IDまたはパスワードが正しくありません");
  };

  const getMI   = (m) => monthlyIncentives[m]||{};
  const setMI   = (m,empId,masterId,amount) => setMonthlyIncentives(prev=>{
    const next = { ...prev,[m]:{ ...prev[m],[empId]:{ ...(prev[m]?.[empId]||{}),[masterId]:amount } } };
    if (company) redisSet(`rakukyu:incentives:${company.id}:${m}`, next[m]);
    return next;
  });
  const getAtt  = (m) => attendanceData[m]||{};
  const setAtt  = (m,empId,field,val) => setAttendanceData(prev=>{
    const next = { ...prev,[m]:{ ...prev[m],[empId]:{ ...(prev[m]?.[empId]||{}),[field]:val } } };
    if (company) redisSet(`rakukyu:attendance:${company.id}:${m}`, next[m]);
    return next;
  });

  const filteredEmployees = useMemo(()=>
    employees.filter(e=>e.name.includes(searchText)||e.department.includes(searchText)||e.nameKana.includes(searchText)),
    [employees,searchText]);

  const dashStats = useMemo(()=>{
    const mi=getMI(selectedMonth); const att=getAtt(selectedMonth);
    return employees.reduce((a,e)=>{
      const p=calcPayroll(e,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id]);
      return { gross:a.gross+p.grossSalary, net:a.net+p.netSalary, incentive:a.incentive+p.incentiveTotal };
    },{gross:0,net:0,incentive:0});
  },[employees,selectedMonth,settings,monthlyIncentives,attendanceData]);

  if (!company && !isSuperAdmin) return <LoginScreen loginId={loginId} setLoginId={setLoginId} loginPw={loginPw} setLoginPw={setLoginPw} loginError={loginError} onLogin={handleLogin}/>;
  if (isSuperAdmin) return <SuperAdminScreen companies={companies} setCompanies={setCompanies} onLogout={()=>{setIsSuperAdmin(false);setLoginId("");setLoginPw("");}} />;

  const cp = { employees, settings, setSettings, saveSettings, monthlyIncentives, getMI, setMI, attendanceData, getAtt, setAtt, yearEndData, setYearEndData, saveYearEnd, selectedMonth, setSelectedMonth, company, monthTransport, setMonthTransport, bonusData, getBonus, setBonus, setBonusPayDate };

  const TABS = [
    { id:"dashboard",  icon:"▪", label:"ダッシュボード" },
    { id:"employees",  icon:"👥", label:"従業員管理" },
    { id:"attendance", icon:"📅", label:"勤怠入力" },
    { id:"payroll",    icon:"💴", label:"給与計算" },
    { id:"ledger",     icon:"📋", label:"賃金台帳" },
    { id:"payslip",    icon:"📄", label:"給与明細" },
    { id:"bonus",      icon:"🎁", label:"賞与計算" },
    { id:"bonusslip",  icon:"📑", label:"賞与明細" },
    { id:"withholding",icon:"🏛", label:"源泉管理" },
    { id:"yearend",    icon:"📝", label:"年末調整" },
    { id:"settings",   icon:"⚙", label:"設定" },
  ];

  const selectTab = (id) => { setTab(id); setSidebarOpen(false); refresh(); };

  return (
    <div style={S.root}>
      <MobileCSS/>
      {/* モバイル オーバーレイ */}
      {sidebarOpen && <div className="rakukyu-overlay" style={S.mobileOverlay} onClick={()=>setSidebarOpen(false)}/>}

      {/* サイドバー */}
      <aside className={`rakukyu-sidebar${sidebarOpen?" open":""}`} style={S.sidebar}>
                <div style={S.sidebarLogo}>
          <div style={S.logoMark}>楽</div>
          <div><div style={S.logoTitle}>楽給.com</div><div style={S.logoSub}>給与計算システム</div></div>
        </div>
        <div style={S.companyBadge}>{settings.companyName}</div>
        {TABS.map(t=>(
          <button key={t.id} style={{...S.navBtn,...(tab===t.id?S.navBtnActive:{})}} onClick={()=>selectTab(t.id)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div style={{flex:1}}/>
        {/* 更新ステータス */}
        <div style={{padding:"6px 12px",marginBottom:4,borderRadius:6,background:"#ffffff08",display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:refreshing?"#f7b731":"#00c9a7",flexShrink:0,
            boxShadow:refreshing?"0 0 6px #f7b731":"0 0 6px #00c9a7"}}/>
          <div>
            <div style={{fontSize:9,color:"#888"}}>最終更新</div>
            <div style={{fontSize:10,color:"#aaa"}}>{new Date(lastRefresh).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
          </div>
          <button style={{marginLeft:"auto",background:"none",border:"1px solid #333",borderRadius:4,color:"#aaa",fontSize:10,cursor:"pointer",padding:"2px 6px"}} onClick={refresh}>
            {refreshing?"⟳":"↻"}
          </button>
        </div>
        <button style={S.logoutBtn} onClick={()=>{setCompany(null);setIsSuperAdmin(false);setLoginId("");setLoginPw("");}}>ログアウト</button>
      </aside>

      {/* メインコンテンツ */}
      <div className="rakukyu-main-wrap" style={S.mainWrap}>
        {/* モバイル ヘッダー */}
        <div className="rakukyu-mobile-header" style={S.mobileHeader}>
          <button style={S.hamburger} onClick={()=>setSidebarOpen(o=>!o)}>
            <span style={S.hamLine}/><span style={S.hamLine}/><span style={S.hamLine}/>
          </button>
          <span style={S.mobileTitle}>楽給.com</span>
          <span style={S.mobileTabLabel}>{TABS.find(t=>t.id===tab)?.label}</span>
          {refreshing&&<span style={{fontSize:10,color:"#00c9a7",marginLeft:"auto"}}>更新中...</span>}
        </div>

        <main style={S.main}>
          {tab==="dashboard"  && <Dashboard  stats={dashStats} {...cp}/>}
          {tab==="employees"  && <EmployeeList employees={employees} searchText={searchText} setSearchText={setSearchText} onEdit={setEditingEmp} onAdd={()=>setShowAddModal(true)} onDelete={id=>saveEmployees(employees.filter(e=>e.id!==id))} settings={settings}/>}
          {tab==="attendance" && <AttendanceTab {...cp}/>}
          {tab==="payroll"    && <PayrollCalc  {...cp}/>}
          {tab==="payslip"    && <PayslipView  {...cp} onPrint={printPayslip}/>}
          {tab==="bonus"      && <BonusCalc    {...cp}/>}
          {tab==="bonusslip"  && <BonusSlip    {...cp}/>}
          {tab==="ledger"     && <LedgerView   {...cp} getBonus={getBonus} onPrint={printLedger}/> }
          {tab==="withholding"&& <WithholdingTax {...cp}/>}
          {tab==="yearend"    && <YearEndAdj   {...cp} getBonus={getBonus} employees={employees}/> }
          {tab==="settings"   && <SettingsTab  {...cp} setEmployees={saveEmployees}/>}
        </main>
      </div>

      {editingEmp  && <EmployeeModal emp={editingEmp}  settings={settings} onSave={u=>{saveEmployees(employees.map(e=>e.id===u.id?u:e));setEditingEmp(null);}}  onClose={()=>setEditingEmp(null)}/>}
      {showAddModal && <EmployeeModal emp={null} settings={settings} onSave={n=>{saveEmployees([...employees,{...n,id:Date.now()}]);setShowAddModal(false);}} onClose={()=>setShowAddModal(false)}/>}
    </div>
  );
}


// ============================================================
// 源泉徴収票 PDF（給与＋賞与を1枚に）
// ============================================================
// 国税庁源泉徴収票テンプレート（Base64埋め込み）
const GENSEN_TEMPLATE_B64 = "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";

async function printGensenhyou(emp, result, year, company) {
  // SheetJSをCDNから動的ロード
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const XLSX = window.XLSX;

  // Base64→ArrayBuffer→Workbook
  const bin  = atob(GENSEN_TEMPLATE_B64);
  const buf  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const wb   = XLSX.read(buf, { type:'array', cellStyles:true, cellFormulas:true });
  const ws   = wb.Sheets[wb.SheetNames[0]];

  const fmtY = (n) => n ? Number(n).toLocaleString('ja-JP') : '';

  function put(addr, val, hAlign='right') {
    if (!addr || addr==='不要' || val==='' || val===null || val===undefined) return;
    if (!ws[addr]) ws[addr] = {};
    ws[addr].v = val;
    ws[addr].t = typeof val === 'number' ? 'n' : 's';
    ws[addr].s = {
      font: { name: 'MS Gothic', sz: 9 },
      alignment: { horizontal: hAlign, vertical: 'center' }
    };
  }

  function both(right, left, val, hAlign='right') {
    put(right, val, hAlign);
    put(left,  val, hAlign);
  }

  const r = result;
  const fuyo = r.dependents || emp.dependents || 0;

  // ── 右側（受給者交付用）＋ 左側（税務署提出用）両方 ──
  both('BE1',  'K1',   String(year),                    'center');
  both('BB2',  'H2',   emp.address  || '',               'left'  );
  both('CE6',  'AK6',  emp.nameKana || '',               'left'  );
  both('BZ7',  'AF7',  emp.name     || '',               'left'  );
  both('AW9',  'C9',   '給与・賞与',                     'left'  );
  both('BH9',  'N9',   fmtY(r.totalGross    || 0));
  both('BO9',  'U9',   fmtY(r.kyuyoShotoku  || 0));
  both('BZ9',  'AF9',  fmtY(r.totalKojo     || 0));
  both('CH9',  'AN9',  fmtY(r.finalTax      || 0));
  both('BG18', 'M18',  fmtY(r.shakaihoken   || 0));
  if (r.seimeiKojo  > 0) both('BP18','V18',  fmtY(r.seimeiKojo));
  if (r.jishin      > 0) both('BX18','AD18', fmtY(r.jishin));
  if (r.jutakuKojo  > 0) both('CF18','AL18', fmtY(r.jutakuKojo));
  if (r.haiguKojo   > 0) both('BD15','J15',  fmtY(r.haiguKojo));
  if (fuyo > 0)          both('BV15','AB15', String(fuyo), 'center');
  if (r.kisoKojo    > 0) both('CA34','AG34', fmtY(r.kisoKojo));

  // 受給者番号・生年月日
  if (emp.code) both('CB2','AH2', emp.code, 'left');

  // 支払者（右・左）
  put('BE56', company.companyAddress || '', 'left');
  put('K56',  company.companyAddress || '', 'left');
  put('BE58', company.companyName    || '', 'left');
  put('K58',  company.companyName    || '', 'left');
  put('CH59', company.companyTel     || '', 'left');
  put('AN59', company.companyTel     || '', 'left');

  // 印刷範囲・ページ設定
  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [{}];
  wb.Workbook.Sheets[0] = {
    ...wb.Workbook.Sheets[0],
    PageSetup: {
      paperSize: 28,      // A3
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    }
  };

  // ダウンロード
  const filename = `源泉徴収票_${emp.name}_${year}年分.xlsx`;
  XLSX.writeFile(wb, filename);
}


// ============================================================
// 源泉徴収簿 PDF（全員一覧）
// ============================================================
function printGensenchousho(employees, allResults, year, company) {
  const w = window.open("","_blank");
  const rows = allResults.filter(({r})=>r);
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>源泉徴収簿</title>
<style>
body{font-family:'MS Gothic',monospace;margin:16px;font-size:9px}
h2{text-align:center;font-size:14px;margin-bottom:4px}
.co{text-align:center;font-size:10px;color:#555;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
th{background:#1a1a2e;color:#fff;padding:4px 5px;font-size:8px;white-space:nowrap}
td{border:1px solid #ccc;padding:3px 5px;white-space:nowrap;font-size:9px}
.r{text-align:right}.refund{color:#00c9a7;font-weight:bold}.extra{color:#fc5c65;font-weight:bold}
.total{background:#f0f4ff;font-weight:bold}
@media print{button{display:none}}
</style></head><body>
<h2>源 泉 徴 収 簿</h2>
<div class="co">${year}年分　${company.companyName||""}</div>
<table>
<tr>
  <th>コード</th><th>氏名</th><th>部署</th>
  <th>支払金額</th><th>給与所得</th><th>所得控除計</th>
  <th>社保控除</th><th>生保控除</th><th>扶養控除</th><th>基礎控除</th>
  <th>課税所得</th><th>年税額</th><th>徴収済税額</th>
  <th>還付/追徴</th>
</tr>
${rows.map(({emp,r})=>`<tr>
  <td>${emp.code||"—"}</td><td>${emp.name}</td><td>${emp.department}</td>
  <td class="r">${(r.totalGross||0).toLocaleString()}</td>
  <td class="r">${(r.kyuyoShotoku||0).toLocaleString()}</td>
  <td class="r">${(r.totalKojo||0).toLocaleString()}</td>
  <td class="r">${(r.shakaihoken||0).toLocaleString()}</td>
  <td class="r">${(r.seimeiKojo||0).toLocaleString()}</td>
  <td class="r">${(r.fuyo||0).toLocaleString()}</td>
  <td class="r">${(r.kisoKojo||0).toLocaleString()}</td>
  <td class="r">${(r.kazeiShotoku||0).toLocaleString()}</td>
  <td class="r">${(r.finalTax||0).toLocaleString()}</td>
  <td class="r">${(r.totalWithheld||0).toLocaleString()}</td>
  <td class="r ${r.diff>=0?"refund":"extra"}">${r.diff>=0?"還付":"追徴"} ¥${Math.abs(r.diff||0).toLocaleString()}</td>
</tr>`).join("")}
<tr class="total">
  <td colspan="3">合計（${rows.length}名）</td>
  <td class="r">${rows.reduce((s,{r})=>s+(r.totalGross||0),0).toLocaleString()}</td>
  <td colspan="7"></td>
  <td class="r">${rows.reduce((s,{r})=>s+(r.finalTax||0),0).toLocaleString()}</td>
  <td class="r">${rows.reduce((s,{r})=>s+(r.totalWithheld||0),0).toLocaleString()}</td>
  <td></td>
</tr>
</table>
<button onclick="window.print()" style="margin-top:10px">印刷/PDF保存</button>
</body></html>`);
  w.document.close();
}


// ============================================================
// 退職所得の源泉徴収票 PDF
// ============================================================
function calcRetirementTax(retireIncome, yearsOfService) {
  let kojo = yearsOfService<=20 ? 400000*yearsOfService : 8000000+700000*(yearsOfService-20);
  kojo = Math.max(kojo, 800000);
  const taxableIncome = Math.max(0, Math.floor((retireIncome - kojo) / 2));
  let tax = 0;
  if (taxableIncome<=1950000)  tax=Math.floor(taxableIncome*0.05);
  else if (taxableIncome<=3300000) tax=Math.floor(taxableIncome*0.10-97500);
  else if (taxableIncome<=6950000) tax=Math.floor(taxableIncome*0.20-427500);
  else if (taxableIncome<=9000000) tax=Math.floor(taxableIncome*0.23-636000);
  else if (taxableIncome<=18000000) tax=Math.floor(taxableIncome*0.33-1536000);
  else tax=Math.floor(taxableIncome*0.40-2796000);
  return { kojo, taxableIncome, tax, finalTax:Math.floor(tax*1.021) };
}
function printRetirementHyou(emp, retireIncome, company) {
  const joinDate = new Date(emp.joinDate||"2000-01-01");
  const retireDate = new Date(emp.retireDate||new Date().toISOString().slice(0,10));
  const yearsOfService = Math.max(1, Math.ceil((retireDate-joinDate)/(1000*60*60*24*365)));
  const r = calcRetirementTax(retireIncome, yearsOfService);
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>退職所得源泉徴収票</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'MS Gothic','Hiragino Kaku Gothic ProN',monospace;font-size:11px;color:#111;padding:20px}
.page{max-width:210mm;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:14px}
.co-name{font-size:14px;font-weight:bold}.co-info{font-size:10px;color:#555;line-height:1.8}
.emp-bar{background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:8px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:16px;font-size:11px}
.section-title{font-size:10px;font-weight:bold;color:#6c63ff;letter-spacing:.15em;border-bottom:2px solid #6c63ff;padding-bottom:4px;margin-bottom:8px;margin-top:12px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ddd;font-size:11px}
.row:last-child{border-bottom:none}
.row-label{color:#555;flex:1}.row-val{font-weight:bold;text-align:right;white-space:nowrap}
.total-row{display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #1a1a2e;font-weight:bold;margin-top:4px}
.net-box{background:#1a1a2e;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:4px;margin-top:14px}
.net-label{font-size:12px;color:#aaa}.net-val{font-size:24px;font-weight:900;color:#00c9a7}
.att-bar{background:#f8f9ff;border:1px solid #e0e4f0;border-radius:4px;padding:8px 0;margin-bottom:12px;display:flex;flex-wrap:wrap}
.att-cell{display:flex;flex-direction:column;align-items:center;padding:4px 12px;border-right:1px solid #e0e4f0;min-width:70px}
.att-cell:last-child{border-right:none}.att-label{font-size:9px;color:#999;margin-bottom:2px}
.att-val{font-size:12px;font-weight:bold}.att-val.ot{color:#fc5c65}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
th{background:#1a1a2e;color:white;padding:5px 6px;text-align:left;white-space:nowrap}
td{border:1px solid #ccc;padding:4px 6px;white-space:nowrap}
.r{text-align:right}.bold{font-weight:bold}.green{color:#00796b}.red{color:#c62828}
.summary{background:#fffbe6;border:1px solid #f7b731;border-radius:4px;padding:12px 16px;margin-top:12px}
.refund-box{padding:10px 16px;border-radius:4px;text-align:center}
.refund-box.refund{background:#e8faf5;border:2px solid #00c9a7}
.refund-box.extra{background:#fff0f0;border:2px solid #fc5c65}
.refund-amount{font-size:22px;font-weight:900}
.seal-area{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.seal{width:50px;height:50px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center}
@media print{button{display:none!important}}
</style></head><body><div class="page">
  <div class="header">
    <div><div class="co-name">${company.companyName||""}</div>
    <div class="co-info">${company.companyAddress||""}<br>TEL: ${company.companyTel||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:bold;letter-spacing:.2em">退職所得の源泉徴収票</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${retireDate.getFullYear()}年分</div>
    </div>
  </div>
  <div class="emp-bar">
    <div><b>${emp.name}</b>&nbsp;様</div>
    <div>コード：${emp.code||"—"}</div>
    <div>住所：${emp.address||"（未登録）"}</div>
    <div>退職日：${emp.retireDate||"—"}</div>
    <div>勤続年数：${yearsOfService}年</div>
  </div>
  <div class="two-col">
    <div>
      <div class="section-title">退 職 所 得 計 算</div>
      <div class="row"><span class="row-label">退職手当等の支払金額</span><span class="row-val">¥${retireIncome.toLocaleString()}</span></div>
      <div class="row"><span class="row-label">退職所得控除額（勤続${yearsOfService}年）</span><span class="row-val">¥${r.kojo.toLocaleString()}</span></div>
      <div class="row" style="font-weight:bold"><span class="row-label">退職所得金額（×1/2）</span><span class="row-val">¥${r.taxableIncome.toLocaleString()}</span></div>
    </div>
    <div>
      <div class="section-title">税 額</div>
      <div class="row"><span class="row-label">所得税額</span><span class="row-val">¥${r.tax.toLocaleString()}</span></div>
      <div class="row"><span class="row-label">復興特別所得税額</span><span class="row-val">¥${(r.finalTax-r.tax).toLocaleString()}</span></div>
      <div class="row" style="font-weight:bold"><span class="row-label">源泉徴収税額合計</span><span class="row-val">¥${r.finalTax.toLocaleString()}</span></div>
    </div>
  </div>
  <div class="net-box">
    <div>
      <div style="font-size:11px;color:#aaa;margin-bottom:2px">退職手当等の支払金額</div>
      <div style="font-size:18px;font-weight:bold">¥${retireIncome.toLocaleString()}</div>
    </div>
    <div style="font-size:20px;color:#666">→</div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#aaa;margin-bottom:2px">差引支給額（手取り）</div>
      <div style="font-size:24px;font-weight:900;color:#00c9a7">¥${(retireIncome-r.finalTax).toLocaleString()}</div>
    </div>
  </div>
  <div class="seal-area">
    <div class="seal">受給者<br>印</div><div class="seal">確認印</div><div class="seal">担当者<br>印</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </div></body></html>`);
  w.document.close();
}
// ============================================================
// MOBILE CSS INJECTION
// ============================================================
function MobileCSS() {
  // viewportメタタグを動的に設定（スマホ拡大防止）
  if (typeof document !== "undefined") {
    let vp = document.querySelector("meta[name=viewport]");
    if (!vp) { vp = document.createElement("meta"); vp.name="viewport"; document.head.appendChild(vp); }
    vp.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  }
  return (
    <style>{`
      .rakukyu-sidebar {
        position: fixed !important;
        top: 0; left: 0; height: 100vh;
        z-index: 100;
        transform: translateX(0);
        transition: transform 0.25s ease;
      }
      .rakukyu-sidebar.hidden {
        transform: translateX(-100%);
      }
      .rakukyu-mobile-header { display: none !important; }
      @media (max-width: 768px) {
        .rakukyu-mobile-header { display: flex !important; }
        .rakukyu-sidebar { transform: translateX(-100%); }
        .rakukyu-sidebar.open { transform: translateX(0) !important; }
        .rakukyu-main-wrap { margin-left: 0 !important; }
      }
      @media (min-width: 769px) {
        .rakukyu-sidebar { position: relative !important; transform: none !important; }
        .rakukyu-overlay { display: none !important; }
      }
    `}</style>
  );
}

// ============================================================
// LOGIN
// ============================================================
// ============================================================
// SUPER ADMIN SCREEN
// ============================================================
function SuperAdminScreen({ companies, setCompanies, onLogout }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [form,        setForm]        = useState({ id:"", name:"", address:"", tel:"", password:"" });
  const [msg,         setMsg]         = useState("");

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleAdd = () => {
    if (!form.id || !form.name || !form.password) { setMsg("会社ID・会社名・パスワードは必須です"); return; }
    if (companies[form.id]) { setMsg("この会社IDは既に使われています"); return; }
    setCompanies(prev=>{
      const next={...prev,[form.id]:{ id:form.id, name:form.name, address:form.address, tel:form.tel, password:form.password }};
      saveCompaniesToRedis(next);
      return next;
    });
    setForm({ id:"", name:"", address:"", tel:"", password:"" });
    setShowAddForm(false);
    setMsg(`「${form.name}」を追加しました`);
    setTimeout(()=>setMsg(""),3000);
  };

  const handleEdit = (co) => {
    setEditId(co.id);
    setShowAddForm(false);
    setForm({ id:co.id, name:co.name, address:co.address||"", tel:co.tel||"", password:co.password });
  };

  const handleUpdate = () => {
    if (!form.name || !form.password) { setMsg("会社名・パスワードは必須です"); return; }
    setCompanies(prev=>{
      const next={...prev,[editId]:{ ...prev[editId], name:form.name, address:form.address, tel:form.tel, password:form.password }};
      saveCompaniesToRedis(next);
      return next;
    });
    setEditId(null);
    setMsg("更新しました");
    setTimeout(()=>setMsg(""),3000);
  };

  const handleDelete = (id) => {
    if (!window.confirm(`「${companies[id].name}」を削除しますか？`)) return;
    setCompanies(prev=>{
      const n={...prev}; delete n[id];
      saveCompaniesToRedis(n);
      return n;
    });
    setMsg("削除しました");
    setTimeout(()=>setMsg(""),3000);
  };

  const coList = Object.values(companies);

  return (
    <div style={{minHeight:"100vh",background:"#0f0f1a",display:"flex",flexDirection:"column",alignItems:"center",padding:"32px 16px"}}>
      <div style={{width:"100%",maxWidth:820,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:900,color:"#6c63ff"}}>楽給.com</div>
          <div style={{fontSize:12,color:"#888",marginTop:2}}>スーパー管理者パネル</div>
        </div>
        <button style={{background:"none",border:"1px solid #444",borderRadius:8,color:"#aaa",fontSize:13,cursor:"pointer",padding:"8px 18px"}} onClick={onLogout}>ログアウト</button>
      </div>

      {msg&&<div style={{width:"100%",maxWidth:820,padding:"10px 16px",background:"#1a3a2e",color:"#00c9a7",borderRadius:8,marginBottom:16,fontSize:13}}>{msg}</div>}

      {/* 会社一覧 */}
      <div style={{width:"100%",maxWidth:820,background:"#1a1a2e",borderRadius:12,overflow:"hidden",marginBottom:20}}>
        <div style={{padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #2a2a3e"}}>
          <span style={{color:"white",fontWeight:700,fontSize:15}}>会社一覧（{coList.length}社）</span>
          <button style={{background:"#6c63ff",border:"none",borderRadius:8,color:"white",fontSize:13,cursor:"pointer",padding:"7px 16px",fontWeight:600}}
            onClick={()=>{setShowAddForm(true);setEditId(null);setForm({id:"",name:"",address:"",tel:"",password:""});setMsg("");}}>
            ＋ 会社追加
          </button>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#12122a"}}>
              {["会社ID","会社名","住所","電話","パスワード","操作"].map(h=>(
                <th key={h} style={{padding:"10px 12px",color:"#888",fontSize:11,fontWeight:600,textAlign:"left",borderBottom:"1px solid #2a2a3e"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coList.map(co=>(
              <tr key={co.id} style={{borderBottom:"1px solid #1e1e30"}}>
                <td style={{padding:"10px 12px",color:"#6c63ff",fontFamily:"monospace",fontSize:12}}>{co.id}</td>
                <td style={{padding:"10px 12px",color:"white",fontSize:13,fontWeight:600}}>{co.name}</td>
                <td style={{padding:"10px 12px",color:"#888",fontSize:11}}>{co.address||"—"}</td>
                <td style={{padding:"10px 12px",color:"#888",fontSize:11}}>{co.tel||"—"}</td>
                <td style={{padding:"10px 12px",color:"#555",fontSize:12,fontFamily:"monospace"}}>{"•".repeat(Math.min(co.password.length,8))}</td>
                <td style={{padding:"10px 12px",display:"flex",gap:6}}>
                  <button style={{background:"none",border:"1px solid #444",borderRadius:6,color:"#aaa",fontSize:11,cursor:"pointer",padding:"4px 10px"}}
                    onClick={()=>handleEdit(co)}>編集</button>
                  <button style={{background:"none",border:"1px solid #4a1a1a",borderRadius:6,color:"#fc5c65",fontSize:11,cursor:"pointer",padding:"4px 10px"}}
                    onClick={()=>handleDelete(co.id)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 追加・編集フォーム */}
      {(showAddForm||editId)&&(
        <div style={{width:"100%",maxWidth:820,background:"#1a1a2e",borderRadius:12,padding:24,border:"1px solid #6c63ff44"}}>
          <div style={{fontWeight:700,color:"white",fontSize:15,marginBottom:18}}>
            {editId?`「${companies[editId]?.name}」を編集`:"新規会社追加"}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {!editId&&(
              <div>
                <label style={{color:"#888",fontSize:12,display:"block",marginBottom:4}}>会社ID <span style={{color:"#fc5c65"}}>*</span></label>
                <input style={{width:"100%",padding:"9px 12px",background:"#0f0f1a",border:"1px solid #333",borderRadius:8,color:"white",fontSize:13,boxSizing:"border-box"}}
                  value={form.id} onChange={e=>setF("id",e.target.value)} placeholder="例: abc123"/>
              </div>
            )}
            <div>
              <label style={{color:"#888",fontSize:12,display:"block",marginBottom:4}}>会社名 <span style={{color:"#fc5c65"}}>*</span></label>
              <input style={{width:"100%",padding:"9px 12px",background:"#0f0f1a",border:"1px solid #333",borderRadius:8,color:"white",fontSize:13,boxSizing:"border-box"}}
                value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="〇〇株式会社"/>
            </div>
            <div>
              <label style={{color:"#888",fontSize:12,display:"block",marginBottom:4}}>住所</label>
              <input style={{width:"100%",padding:"9px 12px",background:"#0f0f1a",border:"1px solid #333",borderRadius:8,color:"white",fontSize:13,boxSizing:"border-box"}}
                value={form.address} onChange={e=>setF("address",e.target.value)} placeholder="都道府県〇〇市..."/>
            </div>
            <div>
              <label style={{color:"#888",fontSize:12,display:"block",marginBottom:4}}>電話番号</label>
              <input style={{width:"100%",padding:"9px 12px",background:"#0f0f1a",border:"1px solid #333",borderRadius:8,color:"white",fontSize:13,boxSizing:"border-box"}}
                value={form.tel} onChange={e=>setF("tel",e.target.value)} placeholder="03-0000-0000"/>
            </div>
            <div>
              <label style={{color:"#888",fontSize:12,display:"block",marginBottom:4}}>パスワード <span style={{color:"#fc5c65"}}>*</span></label>
              <input style={{width:"100%",padding:"9px 12px",background:"#0f0f1a",border:"1px solid #333",borderRadius:8,color:"white",fontSize:13,boxSizing:"border-box"}}
                value={form.password} onChange={e=>setF("password",e.target.value)} placeholder="ログインパスワード"/>
            </div>
          </div>
          {msg&&<div style={{color:"#fc5c65",fontSize:12,marginTop:10}}>{msg}</div>}
          <div style={{display:"flex",gap:10,marginTop:18}}>
            <button style={{background:"#6c63ff",border:"none",borderRadius:8,color:"white",fontSize:13,cursor:"pointer",padding:"10px 24px",fontWeight:700}}
              onClick={editId?handleUpdate:handleAdd}>{editId?"更新":"追加"}</button>
            <button style={{background:"none",border:"1px solid #333",borderRadius:8,color:"#aaa",fontSize:13,cursor:"pointer",padding:"10px 20px"}}
              onClick={()=>{setShowAddForm(false);setEditId(null);setMsg("");}}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginScreen({ loginId,setLoginId,loginPw,setLoginPw,loginError,onLogin }) {
  return (
    <div style={S.loginBg}>
      <div style={S.loginCard}>
                <div style={S.loginLogo}>楽</div>
        <h1 style={S.loginTitle}>楽給.com</h1>
        <p style={S.loginSub}>給与計算システム</p>
        <div style={S.loginField}><label style={S.loginLabel}>会社ID</label><input style={S.loginInput} value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="例: a"/></div>
        <div style={S.loginField}><label style={S.loginLabel}>パスワード</label><input style={S.loginInput} type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin()}/></div>
        {loginError && <div style={S.loginError}>{loginError}</div>}
        <button style={S.loginBtn} onClick={onLogin}>ログイン</button>
        <div style={S.loginHint}><div>クイックデモ: <b>a</b> / <b>a</b></div><div style={{marginTop:4,fontSize:10}}>他: carsera/carsera123　engine/engine123</div></div>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// ============================================================
function SettingsTab({ settings, setSettings, saveSettings, setEmployees, employees }) {
  const [s, setS] = useState(settings);
  const [newDept,    setNewDept]    = useState("");
  const [newIncName, setNewIncName] = useState("");
  const [newIncTax,  setNewIncTax]  = useState(true);
  const [saved, setSaved] = useState(false);

  const upd = (k,v) => setS(prev=>({...prev,[k]:v}));

  const save = () => {
    setSettings(s);
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };

  const addDept = () => {
    if (!newDept.trim()||s.departments.includes(newDept.trim())) return;
    upd("departments",[...s.departments,newDept.trim()]);
    setNewDept("");
  };
  const delDept = (d) => upd("departments",s.departments.filter(x=>x!==d));

  const addInc = () => {
    if (!newIncName.trim()) return;
    upd("incentiveMasters",[...s.incentiveMasters,{id:`inc_${Date.now()}`,name:newIncName.trim(),taxable:newIncTax}]);
    setNewIncName("");
  };
  const delInc = (id) => {
    upd("incentiveMasters",s.incentiveMasters.filter(m=>m.id!==id));
    setEmployees(prev=>prev.map(e=>({...e,enabledIncentives:(e.enabledIncentives||[]).filter(x=>x!==id)})));
  };
  const toggleIncTax = (id) => upd("incentiveMasters",s.incentiveMasters.map(m=>m.id===id?{...m,taxable:!m.taxable}:m));

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>設定</h2>
        <button style={{...S.primaryBtn,background:saved?"#00c9a7":"linear-gradient(135deg,#6c63ff,#4ecdc4)"}} onClick={save}>
          {saved?"✓ 保存しました":"保存する"}
        </button>
      </div>

      {/* 会社情報 */}
      <Section title="🏢 会社情報">
        <div style={S.formGrid}>
          {[
            ["会社名",    "companyName",    "text"],
            ["住所",      "companyAddress", "text"],
            ["電話番号",  "companyTel",     "text"],
            ["メール",    "companyEmail",   "email"],
          ].map(([label,key,type])=>(
            <div key={key} style={S.formRow}>
              <label style={S.formLabel}>{label}</label>
              <input style={S.formInput} type={type} value={s[key]} onChange={e=>upd(key,e.target.value)}/>
            </div>
          ))}
        </div>
      </Section>

      {/* 給与規定 */}
      <Section title="📅 給与規定">
        <div style={S.formGrid}>
          <div style={S.formRow}>
            <label style={S.formLabel}>締め日</label>
            <select style={S.formInput} value={s.closingDay} onChange={e=>upd("closingDay",Number(e.target.value))}>
              {[...Array(28)].map((_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}
              <option value={99}>末日</option>
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.formLabel}>支払日</label>
            <select style={S.formInput} value={s.paymentDay} onChange={e=>upd("paymentDay",Number(e.target.value))}>
              {[...Array(28)].map((_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}
              <option value={99}>末日</option>
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.formLabel}>支払月</label>
            <select style={S.formInput} value={s.paymentMonth} onChange={e=>upd("paymentMonth",e.target.value)}>
              <option value="same">当月払い</option>
              <option value="next">翌月払い</option>
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.formLabel}>源泉所得税の納付方法</label>
            <select style={S.formInput} value={s.withholdingPayType||"monthly"} onChange={e=>upd("withholdingPayType",e.target.value)}>
              <option value="monthly">毎月納付（翌月10日）</option>
              <option value="special">納期特例（半年納付）</option>
            </select>
          </div>
          {s.withholdingPayType==="special" && (
            <div style={{gridColumn:"1/-1",padding:"8px 12px",background:"#f0edff",borderRadius:8,fontSize:12,color:"#6c63ff"}}>
              💡 納期特例：1〜6月分 → <b>7月10日</b>納付　／　7〜12月分 → <b>翌年1月20日</b>納付
            </div>
          )}
          <div style={S.formRow}>
            <label style={S.formLabel}>所定労働日数（月）</label>
            <input style={S.formInput} type="number" value={s.workDaysPerMonth} onChange={e=>upd("workDaysPerMonth",Number(e.target.value))}/>
          </div>
          <div style={S.formRow}>
            <label style={S.formLabel}>1日所定労働時間</label>
            <input style={S.formInput} type="number" step="0.5" value={s.workHoursPerDay} onChange={e=>upd("workHoursPerDay",Number(e.target.value))}/>
          </div>
        </div>
      </Section>

      {/* 残業率 */}
      <Section title="⏱ 残業割増率">
        <div style={S.formGrid}>
          {[
            ["普通残業", "overtimeRate"],
            ["深夜残業", "lateNightRate"],
            ["休日残業", "holidayRate"],
          ].map(([label,key])=>(
            <div key={key} style={S.formRow}>
              <label style={S.formLabel}>{label}</label>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input style={{...S.formInput,width:80}} type="number" step="0.05" value={s[key]} onChange={e=>upd(key,Number(e.target.value))}/>
                <span style={{fontSize:12,color:"#888"}}>倍（×基本時給）</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 支給形態 */}
      <Section title="💼 使用する支給形態">
        <p style={{fontSize:12,color:"#666",marginTop:0,marginBottom:12}}>チェックした支給形態が従業員設定で選択できるようになります。</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
          {["月給制","日給月給制","日給制","時間給制"].map(pt=>{
            const on = (s.payTypes||[]).includes(pt);
            return (
              <label key={pt} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:8,border:`2px solid ${on?"#6c63ff":"#ddd"}`,background:on?"#f0edff":"white",cursor:"pointer",fontSize:13,fontWeight:on?700:400}}>
                <input type="checkbox" style={{display:"none"}} checked={on} onChange={()=>{
                  const cur = s.payTypes||[];
                  upd("payTypes", on ? cur.filter(x=>x!==pt) : [...cur,pt]);
                }}/>
                <span style={{color:on?"#6c63ff":"#999"}}>{on?"✓":""}</span>{pt}
              </label>
            );
          })}
        </div>
      </Section>

      {/* 部署マスター */}
      <Section title="🏷 部署マスター">
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input style={{...S.formInput,flex:1}} placeholder="部署名を入力" value={newDept} onChange={e=>setNewDept(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addDept()}/>
          <button style={S.primaryBtn} onClick={addDept}>＋ 追加</button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {s.departments.map(d=>(
            <div key={d} style={S.masterTag}>
              <span>{d}</span>
              <button style={S.tagDelete} onClick={()=>delDept(d)}>×</button>
            </div>
          ))}
        </div>
      </Section>

      {/* 手当・インセンティブマスター */}
      <Section title="💰 手当・インセンティブマスター">
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
          <input style={{...S.formInput,flex:1}} placeholder="項目名（例：営業インセンティブ）" value={newIncName} onChange={e=>setNewIncName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addInc()}/>
          <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",cursor:"pointer"}}>
            <input type="checkbox" checked={newIncTax} onChange={e=>setNewIncTax(e.target.checked)}/>課税対象
          </label>
          <button style={S.primaryBtn} onClick={addInc}>＋ 追加</button>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr><th style={S.th}>項目名</th><th style={S.th}>課税区分</th><th style={S.th}>操作</th></tr></thead>
            <tbody>
              {s.incentiveMasters.map(m=>(
                <tr key={m.id} style={S.tr}>
                  <td style={S.td}><b>{m.name}</b></td>
                  <td style={S.td}>
                    <button
                      style={{...S.typeBadge,cursor:"pointer",background:m.taxable?"#e8f4fd":"#fff3e0",color:m.taxable?"#1a6db8":"#e07000",border:"none",padding:"3px 10px",borderRadius:20,fontSize:12}}
                      onClick={()=>toggleIncTax(m.id)}
                    >
                      {m.taxable?"課税":"非課税"} ↔
                    </button>
                  </td>
                  <td style={S.td}><button style={S.deleteBtn} onClick={()=>delInc(m.id)}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{...S.card,marginBottom:16}}>
      <h3 style={{...S.cardTitle,fontSize:14,borderBottom:"2px solid #6c63ff",paddingBottom:8,marginBottom:14}}>{title}</h3>
      {children}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ stats, employees, selectedMonth, setSelectedMonth, settings, getMI, getAtt }) {
  const byDept = useMemo(()=>{ const m={}; employees.forEach(e=>{m[e.department]=(m[e.department]||0)+1;}); return m; },[employees]);
  return (
    <div style={S.page}>
      <div style={S.pageHeader}><h2 style={S.pageTitle}>ダッシュボード</h2><MonthPicker value={selectedMonth} onChange={setSelectedMonth}/></div>
      <div style={S.statsGrid}>
        {[
          {label:"従業員数",       value:`${employees.length}名`, sub:"在籍中",    color:"#6c63ff"},
          {label:"総支給額",       value:`¥${fmt(stats.gross)}`,  sub:selectedMonth, color:"#00c9a7"},
          {label:"差引支給額合計", value:`¥${fmt(stats.net)}`,    sub:"手取り合計", color:"#f7b731"},
          {label:"インセンティブ計",value:`¥${fmt(stats.incentive)}`,sub:"今月の報酬",color:"#fc5c65"},
        ].map(s=>(
          <div key={s.label} style={{...S.statCard,borderTopColor:s.color}}>
            <div style={{...S.statValue,color:s.color}}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
            <div style={S.statSub}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={S.twoCol}>
        <div style={S.card}>
          <h3 style={S.cardTitle}>部署別人員</h3>
          {Object.entries(byDept).map(([dept,cnt])=>(
            <div key={dept} style={S.barRow}>
              <span style={S.barLabel}>{dept}</span>
              <div style={S.barTrack}><div style={{...S.barFill,width:`${(cnt/employees.length)*100}%`}}/></div>
              <span style={S.barCnt}>{cnt}名</span>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <h3 style={S.cardTitle}>給与規定</h3>
          {[
            ["締め日",      `毎月${settings.closingDay===99?"末日":settings.closingDay+"日"}`],
            ["源泉納付",    settings.withholdingPayType==="special"?"納期特例（半年）":"毎月納付（翌月10日）"],
            ["支払日",      `毎月${settings.paymentDay===99?"末日":settings.paymentDay+"日"}（${settings.paymentMonth==="same"?"当月":"翌月"}払い）`],
            ["所定労働日数",`${settings.workDaysPerMonth}日/月`],
            ["所定労働時間",`${settings.workHoursPerDay}時間/日`],
            ["普通残業",    `×${settings.overtimeRate}`],
            ["深夜残業",    `×${settings.lateNightRate}`],
            ["休日残業",    `×${settings.holidayRate}`],
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px dotted #eee",fontSize:13}}>
              <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ATTENDANCE TAB
// ============================================================
function AttendanceTab({ employees, selectedMonth, setSelectedMonth, settings, getAtt, setAtt }) {
  const att = getAtt(selectedMonth);

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean);
      lines.slice(1).forEach(line => {
        const cols = line.split(",");
        // コードで検索、なければIDで検索
        const byCode = employees.find(e=>e.code && e.code===cols[0].trim());
        const empId = byCode ? byCode.id : Number(cols[1]);
        if (!empId) return;
        setAtt(selectedMonth, empId, "workDays",       Number(cols[2])||0);
        setAtt(selectedMonth, empId, "absentDays",     Number(cols[3])||0);
        setAtt(selectedMonth, empId, "paidLeaveDays",  Number(cols[4])||0);
        setAtt(selectedMonth, empId, "scheduledHours", Number(cols[5])||0);
        setAtt(selectedMonth, empId, "actualHours",    Number(cols[6])||0);
        setAtt(selectedMonth, empId, "overtime",       Number(cols[7])||0);
        setAtt(selectedMonth, empId, "lateNight",      Number(cols[8])||0);
        setAtt(selectedMonth, empId, "holiday",        Number(cols[9])||0);
      });
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const downloadTemplate = () => {
    const header = "従業員コード,従業員ID,出勤日数,欠勤日数,有給日数,所定労働時間,実働時間,普通残業時間,深夜残業時間,休日残業時間";
    const rows = employees.map(e=>`${e.code||""},${e.id},${settings.workDaysPerMonth},0,0,${settings.workDaysPerMonth*settings.workHoursPerDay},${settings.workDaysPerMonth*settings.workHoursPerDay},0,0,0`);
    const csv = [header,...rows].join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `勤怠テンプレート_${selectedMonth}.csv`;
    a.click();
  };

  const FIELDS = [
    {key:"workDays",       label:"出勤日数",     unit:"日",  w:60},
    {key:"absentDays",     label:"欠勤日数",     unit:"日",  w:60},
    {key:"paidLeaveDays",  label:"有給日数",     unit:"日",  w:60},
    {key:"scheduledHours", label:"所定時間",     unit:"h",   w:60},
    {key:"actualHours",    label:"実働時間",     unit:"h",   w:60},
    {key:"overtime",       label:"普通残業",     unit:"h",   w:60},
    {key:"lateNight",      label:"深夜残業",     unit:"h",   w:60},
    {key:"holiday",        label:"休日残業",     unit:"h",   w:60},
  ];

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>勤怠入力</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
          <button style={S.secondaryBtn} onClick={downloadTemplate}>⬇ CSVテンプレート</button>
          <label style={{...S.primaryBtn,cursor:"pointer"}}>
            ⬆ CSVインポート
            <input type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV}/>
          </label>
        </div>
      </div>

      <div style={{marginBottom:12,padding:"8px 14px",background:"#f0edff",borderRadius:8,fontSize:12,color:"#6c63ff"}}>
        💡 所定労働日数: <b>{settings.workDaysPerMonth}日</b>　1日所定時間: <b>{settings.workHoursPerDay}h</b>　
        普通残業: <b>×{settings.overtimeRate}</b>　深夜: <b>×{settings.lateNightRate}</b>　休日: <b>×{settings.holidayRate}</b>
        　<span style={{color:"#aaa"}}>※設定タブで変更可</span>
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{...S.th,minWidth:100}}>従業員</th>
              <th style={{...S.th,fontSize:10}}>雇用形態</th>
              {FIELDS.map(f=><th key={f.key} style={{...S.th,fontSize:10,minWidth:72}}>{f.label}<br/><span style={{opacity:0.6}}>{f.unit}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {employees.map(e=>{
              const a = att[e.id]||{};
              const isPT = e.employmentType==="パート"||e.employmentType==="アルバイト";
              return (
                <tr key={e.id} style={S.tr}>
                  <td style={{...S.td,fontWeight:600}}>{e.name}<br/><span style={{fontSize:10,color:"#888"}}>{e.department}</span></td>
                  <td style={S.td}><span style={S.typeBadge}>{e.employmentType}</span></td>
                  {FIELDS.map(f=>{
                    const disabled = isPT && ["overtime","lateNight","holiday"].includes(f.key);
                    return (
                      <td key={f.key} style={{...S.td,padding:"6px 4px"}}>
                        <input
                          style={{...S.formInput,width:f.w,padding:"4px 6px",fontSize:12,textAlign:"center",background:disabled?"#f8f8f8":"white",color:disabled?"#bbb":"#333"}}
                          type="number" step="0.5" min="0"
                          disabled={disabled}
                          value={a[f.key]??""}
                          placeholder="0"
                          onChange={ev=>setAtt(selectedMonth,e.id,f.key,Number(ev.target.value))}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// EMPLOYEE LIST
// ============================================================
function EmployeeList({ employees, searchText, setSearchText, onEdit, onAdd, onDelete, settings }) {
  const [empFilter, setEmpFilter] = useState("active");
  const displayEmployees = employees.filter(e => {
    const isRetired = !!(e.retireDate && e.retireDate.trim() !== "");
    const statusOk = empFilter==="active" ? !isRetired : empFilter==="retired" ? isRetired : true;
    const searchOk = !searchText || e.name.includes(searchText) || e.department.includes(searchText) || (e.nameKana||"").includes(searchText) || (e.code||"").includes(searchText);
    return statusOk && searchOk;
  });
  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>従業員管理</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={S.searchInput} placeholder="氏名・部署で検索" value={searchText} onChange={e=>setSearchText(e.target.value)}/>
          <select style={{...S.formInput,width:"auto"}} value={empFilter} onChange={e=>setEmpFilter(e.target.value)}>
            <option value="all">全員</option>
            <option value="active">在籍中のみ</option>
            <option value="retired">退職者のみ</option>
          </select>
          <button style={S.primaryBtn} onClick={onAdd}>＋ 新規登録</button>
        </div>
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{["コード","氏名（カナ）","部署","雇用形態","支給形態","基本給/時給","保険","入社日","退職日","操作"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {displayEmployees.map(e=>{
              const isRetired = !!(e.retireDate && e.retireDate.trim() !== "");
              return (<tr key={e.id} style={{...S.tr,background:isRetired?"#f8f8f8":undefined,opacity:isRetired?0.7:1}}>
                <td style={{...S.td,fontSize:11,color:"#888",fontFamily:"monospace"}}>{e.code||"—"}</td>
                <td style={S.td}><div style={{fontWeight:600}}>{e.name}</div><div style={{fontSize:11,color:"#888"}}>{e.nameKana}</div></td>
                <td style={S.td}><span style={S.deptBadge}>{e.department}</span></td>
                <td style={S.td}><span style={S.typeBadge}>{e.employmentType}</span></td>
                <td style={S.td}><span style={{...S.typeBadge,background:"#e8f8f0",color:"#2e7d32"}}>{e.payType||"月給制"}</span></td>
                <td style={{...S.td,fontWeight:700}}>
                  {e.payType==="時間給制"?`¥${fmt(e.hourlyWage)}/h`
                  :e.payType==="日給制"?`¥${fmt(e.dailyWage||0)}/日`
                  :`¥${fmt(e.baseSalary)}`}
                </td>
                <td style={S.td}>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {e.insuranceFlags?.healthInsurance!==false&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:10,background:"#e3f2fd",color:"#1565c0"}}>健保</span>}
                    {e.insuranceFlags?.welfarePension!==false&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:10,background:"#e8f5e9",color:"#2e7d32"}}>厚年</span>}
                    {e.insuranceFlags?.employmentInsurance!==false&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:10,background:"#fff3e0",color:"#e65100"}}>雇保</span>}
                  </div>
                </td>
                <td style={S.td}>{e.joinDate}</td>
                <td style={S.td}>
                  {e.retireDate
                    ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#ffebee",color:"#c62828",fontWeight:600}}>{e.retireDate} 退職</span>
                    : <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#e8f5e9",color:"#2e7d32",fontWeight:600}}>在籍中</span>}
                </td>
                <td style={S.td}>
                  <button style={S.editBtn} onClick={()=>onEdit(e)}>編集</button>
                  <button style={S.deleteBtn} onClick={()=>{if(confirm(`${e.name}を削除しますか？`))onDelete(e.id);}}>削除</button>
                </td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// EMPLOYEE MODAL
// ============================================================
function EmployeeModal({ emp, settings, onSave, onClose }) {
  const blank = { code:"",name:"",nameKana:"",zipCode:"",address:"",department:settings.departments[0]||"",employmentType:"正社員",payType:"月給制",insuranceFlags:{healthInsurance:true,welfarePension:true,employmentInsurance:true},baseSalary:200000,dailyWage:0,transportAllowance:0,housingAllowance:0,otherAllowance:0,age:30,dependents:0,residentTax:0,joinDate:"",retireDate:"",hourlyWage:1000,monthlyHours:80,enabledIncentives:[] };
  const [form, setForm] = useState(emp||blank);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const isPT = form.employmentType==="パート"||form.employmentType==="アルバイト";
  const toggleInc = (id) => set("enabledIncentives",(form.enabledIncentives||[]).includes(id)?(form.enabledIncentives||[]).filter(x=>x!==id):[...(form.enabledIncentives||[]),id]);
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <h3 style={S.modalTitle}>{emp?"従業員編集":"新規従業員登録"}</h3>
        <div style={S.formGrid}>
          {[["従業員コード","code","text"],["氏名","name","text"],["氏名（カナ）","nameKana","text"],["入社日","joinDate","date"],["退職日","retireDate","date"],["年齢","age","number"],["扶養人数","dependents","number"]].map(([label,key,type])=>(
            <div key={key} style={S.formRow}><label style={S.formLabel}>{label}</label><input style={S.formInput} type={type} value={form[key]} onChange={e=>set(key,type==="number"?Number(e.target.value):e.target.value)}/></div>
          ))}
          <div style={S.formRow}><label style={S.formLabel}>部署</label><select style={S.formInput} value={form.department} onChange={e=>set("department",e.target.value)}>{settings.departments.map(d=><option key={d}>{d}</option>)}</select></div>
          <div style={S.formRow}><label style={S.formLabel}>雇用形態</label><select style={S.formInput} value={form.employmentType} onChange={e=>set("employmentType",e.target.value)}>{EMPLOYMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div style={S.formRow}>
            <label style={S.formLabel}>支給形態</label>
            <select style={S.formInput} value={form.payType||"月給制"} onChange={e=>set("payType",e.target.value)}>
              {(settings.payTypes||["月給制","日給月給制","日給制","時間給制"]).map(pt=><option key={pt}>{pt}</option>)}
            </select>
          </div>
          {(form.payType==="時間給制"||isPT)?(
            <>
              <div style={S.formRow}><label style={S.formLabel}>時給（円）</label><input style={S.formInput} type="number" value={form.hourlyWage} onChange={e=>set("hourlyWage",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>月間所定時間（目安）</label><input style={S.formInput} type="number" value={form.monthlyHours} onChange={e=>set("monthlyHours",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>通勤手当（円）</label><input style={S.formInput} type="number" value={form.transportAllowance||0} onChange={e=>set("transportAllowance",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>住民税（円/月）</label><input style={S.formInput} type="number" value={form.residentTax||0} onChange={e=>set("residentTax",Number(e.target.value))}/></div>
            </>
          ):form.payType==="日給制"?(
            <>
              <div style={S.formRow}><label style={S.formLabel}>日給（円）</label><input style={S.formInput} type="number" value={form.dailyWage||0} onChange={e=>set("dailyWage",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>通勤手当（円）</label><input style={S.formInput} type="number" value={form.transportAllowance} onChange={e=>set("transportAllowance",Number(e.target.value))}/></div>
            </>
          ):(
            <>
              <div style={S.formRow}><label style={S.formLabel}>{form.payType==="日給月給制"?"月給（欠勤控除あり）（円）":"基本給（円）"}</label><input style={S.formInput} type="number" value={form.baseSalary} onChange={e=>set("baseSalary",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>通勤手当（円）</label><input style={S.formInput} type="number" value={form.transportAllowance} onChange={e=>set("transportAllowance",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>住宅手当（円）</label><input style={S.formInput} type="number" value={form.housingAllowance} onChange={e=>set("housingAllowance",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>その他手当（円）</label><input style={S.formInput} type="number" value={form.otherAllowance} onChange={e=>set("otherAllowance",Number(e.target.value))}/></div>
              <div style={S.formRow}><label style={S.formLabel}>住民税（円/月）</label><input style={S.formInput} type="number" value={form.residentTax} onChange={e=>set("residentTax",Number(e.target.value))}/></div>
            </>
          )}
        </div>
        {/* 住所 */}
        <div style={{marginTop:10}}>
          <label style={S.formLabel}>住所</label>
          <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
            <input style={{...S.formInput,width:110}} type="text" placeholder="〒000-0000" value={form.zipCode||""} onChange={e=>set("zipCode",e.target.value)}/>
            <input style={{...S.formInput,flex:1}} type="text" placeholder="都道府県・市区町村・番地" value={form.address||""} onChange={e=>set("address",e.target.value)}/>
          </div>
        </div>

        {/* 社会保険・労働保険 */}
        <div style={{marginTop:14,padding:"12px 14px",background:"#f8f8ff",borderRadius:8,border:"1px solid #e0deff"}}>
          <div style={{...S.formLabel,marginBottom:8,fontSize:12,color:"#6c63ff"}}>社会保険・労働保険の加入状況</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {[
              {key:"healthInsurance",  label:"健康保険・介護保険"},
              {key:"welfarePension",   label:"厚生年金"},
              {key:"employmentInsurance",label:"雇用保険"},
            ].map(({key,label})=>{
              const flags = form.insuranceFlags||{healthInsurance:true,welfarePension:true,employmentInsurance:true};
              const on = flags[key]!==false;
              return (
                <label key={key} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:20,border:`1px solid ${on?"#6c63ff":"#ddd"}`,background:on?"#f0edff":"white",cursor:"pointer",fontSize:12,fontWeight:on?600:400}}>
                  <input type="checkbox" style={{accentColor:"#6c63ff"}} checked={on}
                    onChange={()=>set("insuranceFlags",{...(form.insuranceFlags||{healthInsurance:true,welfarePension:true,employmentInsurance:true}),[key]:!on})}/>
                  {label}
                </label>
              );
            })}
          </div>
          <div style={{fontSize:10,color:"#aaa",marginTop:6}}>※ 雇用形態に関わらず個別に設定できます</div>
        </div>

        {settings.incentiveMasters.length>0&&(
          <div style={{marginTop:14}}>
            <div style={S.formLabel}>付与する手当・報酬項目</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
              {settings.incentiveMasters.map(m=>{
                const on=(form.enabledIncentives||[]).includes(m.id);
                return <label key={m.id} style={{...S.incToggle,background:on?"#6c63ff":"#f0f0f0",color:on?"white":"#555",cursor:"pointer"}}><input type="checkbox" style={{display:"none"}} checked={on} onChange={()=>toggleInc(m.id)}/>{m.name}</label>;
              })}
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button style={S.cancelBtn} onClick={onClose}>キャンセル</button>
          <button style={S.primaryBtn} onClick={()=>onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PAYROLL CALC
// ============================================================
function PayrollCalc({ employees, settings, getMI, setMI, getAtt, selectedMonth, setSelectedMonth, monthTransport, setMonthTransport }) {
  const [incOpen, setIncOpen] = useState(false);
  const mi = getMI(selectedMonth);
  const att = getAtt(selectedMonth);
  const rows = useMemo(()=>employees.map(e=>{
    const empWithTransport = monthTransport[e.id]!==undefined ? {...e,transportAllowance:monthTransport[e.id]} : e;
    return {emp:e,p:calcPayroll(empWithTransport,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id])};
  }),[employees,selectedMonth,settings,mi,att,monthTransport]);
  const totals = useMemo(()=>rows.reduce((a,{p})=>({gross:a.gross+p.grossSalary,net:a.net+p.netSalary,incentive:a.incentive+p.incentiveTotal,deduct:a.deduct+p.totalDeduction}),{gross:0,net:0,incentive:0,deduct:0}),[rows]);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}><h2 style={S.pageTitle}>給与計算</h2><MonthPicker value={selectedMonth} onChange={setSelectedMonth}/></div>
      <div style={S.statsGrid}>
        {[
          {label:"総支給額",        value:`¥${fmt(totals.gross)}`,    color:"#00c9a7"},
          {label:"インセンティブ計", value:`¥${fmt(totals.incentive)}`,color:"#fc5c65"},
          {label:"控除合計",         value:`¥${fmt(totals.deduct)}`,   color:"#f7b731"},
          {label:"差引支給合計",     value:`¥${fmt(totals.net)}`,      color:"#6c63ff"},
        ].map(s=><div key={s.label} style={{...S.statCard,borderTopColor:s.color}}><div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div><div style={S.statLabel}>{s.label}</div></div>)}
      </div>

      {/* インセンティブ月次入力 */}
      {settings.incentiveMasters.length>0&&(
        <div style={{...S.card,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:incOpen?12:0,cursor:"pointer"}} onClick={()=>setIncOpen(o=>!o)}>
            <h3 style={{...S.cardTitle,marginBottom:0}}>💰 手当・インセンティブ 月次入力（{selectedMonth}）</h3>
            <span style={{fontSize:18,color:"#6c63ff",userSelect:"none"}}>{incOpen?"▲":"▼"}</span>
          </div>
          {incOpen&&<div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{...S.th,minWidth:100}}>従業員</th>
                  {settings.incentiveMasters.map(m=><th key={m.id} style={{...S.th,fontSize:11,minWidth:120}}>{m.name}<br/><span style={{fontSize:9,opacity:0.7}}>{m.taxable?"課税":"非課税"}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {employees.map(e=>{
                  const enabledIds=e.enabledIncentives||[];
                  if(enabledIds.length===0) return null;
                  return (
                    <tr key={e.id} style={S.tr}>
                      <td style={{...S.td,fontWeight:600}}>{e.name}</td>
                      {settings.incentiveMasters.map(m=>{
                        const enabled=enabledIds.includes(m.id);
                        return (
                          <td key={m.id} style={{...S.td,padding:"6px 8px"}}>
                            {enabled?(
                              <div style={{display:"flex",alignItems:"center",gap:2}}>
                                <span style={{fontSize:11}}>¥</span>
                                <input style={{...S.formInput,width:88,padding:"3px 6px",fontSize:12}} type="number" placeholder="0"
                                  value={mi[e.id]?.[m.id]||""}
                                  onChange={ev=>setMI(selectedMonth,e.id,m.id,Number(ev.target.value))}/>
                              </div>
                            ):<span style={{color:"#ddd",fontSize:11}}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{["氏名","雇用形態","基本給","残業代","インセンティブ","通勤手当","住宅・他","総支給","社保計","所得税","住民税","控除計","手取り"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({emp,p})=>(
              <tr key={emp.id} style={S.tr}>
                <td style={{...S.td,fontWeight:600}}>{emp.name}</td>
                <td style={S.td}><span style={S.typeBadge}>{emp.employmentType}</span></td>
                <td style={S.td}>¥{fmt(p.baseSalary)}</td>
                <td style={S.td}>{p.overtimePay>0?`¥${fmt(p.overtimePay)}`:"—"}</td>
                <td style={{...S.td,color:"#fc5c65",fontWeight:p.incentiveTotal>0?700:400}}>{p.incentiveTotal>0?`¥${fmt(p.incentiveTotal)}`:"—"}</td>
                <td style={{...S.td,padding:"4px 6px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:2}}>
                    <span style={{fontSize:10}}>¥</span>
                    <input style={{...S.formInput,width:80,padding:"3px 5px",fontSize:11}} type="number" placeholder="0"
                      value={monthTransport[emp.id]??emp.transportAllowance??0}
                      onChange={ev=>setMonthTransport(prev=>({...prev,[emp.id]:Number(ev.target.value)}))}/>
                  </div>
                </td>
                <td style={S.td}>{(p.housingAllowance+p.otherAllowance)>0?`¥${fmt(p.housingAllowance+p.otherAllowance)}`:"—"}</td>
                <td style={{...S.td,color:"#00c9a7",fontWeight:700}}>¥{fmt(p.grossSalary)}</td>
                <td style={S.td}>¥{fmt(p.socialTotal)}</td>
                <td style={S.td}>¥{fmt(p.incomeTax)}</td>
                <td style={S.td}>¥{fmt(p.residentTax)}</td>
                <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(p.totalDeduction)}</td>
                <td style={{...S.td,fontWeight:700}}>¥{fmt(p.netSalary)}</td>
              </tr>
            ))}
            <tr style={{background:"#f0f4ff",fontWeight:700}}>
              <td style={S.td} colSpan={4}>合計（{rows.length}名）</td>
              <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(totals.incentive)}</td>
              <td style={S.td}></td>
              <td style={{...S.td,color:"#00c9a7"}}>¥{fmt(totals.gross)}</td>
              <td colSpan={3} style={S.td}></td>
              <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(totals.deduct)}</td>
              <td style={S.td}>¥{fmt(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// PAYSLIP VIEW
// ============================================================
function PayslipView({ employees, settings, getMI, getAtt, selectedMonth, setSelectedMonth, company, onPrint }) {
  const [selected, setSelected] = useState(employees[0]?.id);
  const emp = employees.find(e=>e.id===selected)||employees[0];
  const att = emp ? (getAtt(selectedMonth)[emp.id]||{}) : {};
  const p = emp ? calcPayroll(emp,selectedMonth,settings,settings.incentiveMasters,getMI(selectedMonth),att) : null;
  const isPT = emp && (emp.payType==="時間給制"||emp.employmentType==="パート"||emp.employmentType==="アルバイト");

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>給与明細書</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
          <select style={S.formInput} value={selected} onChange={e=>setSelected(Number(e.target.value))}>
            {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:""}{e.name}</option>)}
          </select>
          {emp&&p&&<button style={S.primaryBtn} onClick={()=>onPrint(emp,p,settings,att)}>📄 PDF印刷</button>}
        </div>
      </div>
      {emp&&p&&(
        <div style={S.payslipCard}>
          {/* ヘッダー */}
          <div style={S.payslipHeader}>
            <div>
              <div style={S.payslipCompany}>{settings.companyName}</div>
              <div style={S.payslipTitle}>給 与 明 細 書</div>
            </div>
            <div style={S.payslipMeta}>
              <div style={S.payslipMonth}>{selectedMonth.replace("-","年")}月分</div>
              <div style={S.payslipName}>{emp.name} 様</div>
              <div style={{fontSize:11,color:"#aaa"}}>{emp.code&&`${emp.code}　`}{emp.department}　{emp.employmentType}（{emp.payType||"月給制"}）</div>
            </div>
          </div>

          {/* 勤怠情報バー */}
          <div style={{background:"#f8f9ff",borderBottom:"1px solid #e0e4f0",padding:"10px 20px"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6c63ff",marginBottom:6,letterSpacing:"0.12em"}}>勤 怠 情 報</div>
            <div style={{display:"flex",flexWrap:"wrap"}}>
              {[
                ["出勤",   att.workDays!=null     ? `${att.workDays}日`      : "—"],
                ["欠勤",   att.absentDays!=null   ? `${att.absentDays}日`    : "—"],
                ["有給",   att.paidLeaveDays!=null? `${att.paidLeaveDays}日` : "—"],
                ["所定時間",att.scheduledHours!=null?`${att.scheduledHours}h`:"—"],
                ["実働時間",att.actualHours!=null  ? `${att.actualHours}h`   : "—"],
                ["普通残業",att.overtime!=null     ? `${att.overtime}h`      : "—"],
                ["深夜残業",att.lateNight!=null    ? `${att.lateNight}h`     : "—"],
                ["休日残業",att.holiday!=null      ? `${att.holiday}h`       : "—"],
              ].map(([label,val])=>{
                const isOT = label.includes("残業") && val!=="—" && val!=="0h";
                return (
                  <div key={label} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 12px",borderRight:"1px solid #e0e4f0",minWidth:66}}>
                    <span style={{fontSize:9,color:"#999",marginBottom:2}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:isOT?"#fc5c65":"#1a1a2e"}}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 支給・控除 */}
          <div style={S.payslipBody}>
            <div style={S.payslipSection}>
              <div style={S.sectionHeader}>支 給</div>
              {[
                [isPT?"賃金（時給×実働）":"基本給", p.baseSalary],
                ["時間外手当",   p.overtimePay],
                ["通勤手当",     p.transportAllowance],
                ["住宅手当",     p.housingAllowance],
                ["その他手当",   p.otherAllowance],
              ].map(([label,val])=>val>0&&(
                <div key={label} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{label}</span>
                  <span style={S.payslipRowValue}>¥{fmt(val)}</span>
                </div>
              ))}
              {p.incentiveItems.length>0&&(
                <>
                  <div style={{fontSize:10,color:"#aaa",margin:"6px 0 2px",borderTop:"1px dashed #eee",paddingTop:4}}>— 手当・インセンティブ —</div>
                  {p.incentiveItems.map(i=>(
                    <div key={i.id} style={S.payslipRow}>
                      <span style={{...S.payslipRowLabel,color:"#6c63ff"}}>{i.name}{!i.taxable&&" ★非課税"}</span>
                      <span style={{...S.payslipRowValue,color:"#fc5c65"}}>¥{fmt(i.amount)}</span>
                    </div>
                  ))}
                </>
              )}
              <div style={{...S.payslipRow,borderTop:"2px solid #1a1a2e",fontWeight:700}}>
                <span>総支給額</span><span style={{color:"#00c9a7"}}>¥{fmt(p.grossSalary)}</span>
              </div>
            </div>
            <div style={S.payslipSection}>
              <div style={S.sectionHeader}>控 除</div>
              {[
                ["健康保険料",    p.health],
                ["介護保険料",    p.nursing],
                ["厚生年金保険料",p.pension],
                ["雇用保険料",    p.employment],
                ["所得税",        p.incomeTax],
                ["住民税",        p.residentTax],
              ].map(([label,val])=>(
                <div key={label} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{label}</span>
                  <span style={S.payslipRowValue}>{val>0?`¥${fmt(val)}`:"—"}</span>
                </div>
              ))}
              <div style={{...S.payslipRow,borderTop:"2px solid #1a1a2e",fontWeight:700}}>
                <span>控除合計</span><span style={{color:"#fc5c65"}}>¥{fmt(p.totalDeduction)}</span>
              </div>
            </div>
          </div>
          <div style={S.netSalaryBox}>
            <span style={S.netLabel}>差引支給額（手取り）</span>
            <span style={S.netValue}>¥{fmt(p.netSalary)}</span>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// BONUS CALC
// ============================================================
function BonusCalc({ employees, settings, selectedMonth, setSelectedMonth, getBonus, setBonus, setBonusPayDate }) {
  const bd = getBonus(selectedMonth);
  const rows = employees.map(e=>({emp:e, b:calcBonusAmount(e, bd.data?.[e.id]?.bonus||0)}));
  const totals = rows.reduce((a,{b})=>({gross:a.gross+b.bonusAmount,net:a.net+b.netBonus,tax:a.tax+b.incomeTax}),{gross:0,net:0,tax:0});

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>賞与計算</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"#f0edff",borderRadius:8}}>
            <span style={{fontSize:12,color:"#6c63ff",fontWeight:600}}>支給日</span>
            <input type="date" style={{...S.formInput,border:"none",background:"transparent",padding:"2px 4px",fontSize:13,color:"#1a1a2e"}}
              value={bd.payDate||""}
              onChange={e=>setBonusPayDate(selectedMonth,e.target.value)}/>
          </div>
        </div>
      </div>
      <div style={S.statsGrid}>
        {[
          {label:"賞与総額",    value:`¥${fmt(totals.gross)}`, color:"#f7b731"},
          {label:"差引支給合計",value:`¥${fmt(totals.net)}`,   color:"#00c9a7"},
          {label:"源泉所得税計",value:`¥${fmt(totals.tax)}`,   color:"#fc5c65"},
          {label:"支給日",      value:bd.payDate||"未設定",     color:"#6c63ff"},
        ].map(s=><div key={s.label} style={{...S.statCard,borderTopColor:s.color}}><div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div><div style={S.statLabel}>{s.label}</div></div>)}
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{["コード","氏名","部署","雇用形態","賞与支給額","健保","介護","厚年","雇保","所得税","控除計","手取り"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({emp,b})=>(
              <tr key={emp.id} style={S.tr}>
                <td style={{...S.td,fontSize:11,color:"#888",fontFamily:"monospace"}}>{emp.code||"—"}</td>
                <td style={{...S.td,fontWeight:600}}>{emp.name}</td>
                <td style={S.td}>{emp.department}</td>
                <td style={S.td}><span style={S.typeBadge}>{emp.employmentType}</span></td>
                <td style={{...S.td,padding:"6px 8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:2}}>
                    <span style={{fontSize:11}}>¥</span>
                    <input style={{...S.formInput,width:110,padding:"4px 6px",fontSize:13}} type="number" placeholder="0"
                      value={bd.data?.[emp.id]?.bonus||""}
                      onChange={ev=>setBonus(selectedMonth,emp.id,Number(ev.target.value))}/>
                  </div>
                </td>
                <td style={S.td}>{b.health>0?`¥${fmt(b.health)}`:"—"}</td>
                <td style={S.td}>{b.nursing>0?`¥${fmt(b.nursing)}`:"—"}</td>
                <td style={S.td}>{b.pension>0?`¥${fmt(b.pension)}`:"—"}</td>
                <td style={S.td}>{b.employment>0?`¥${fmt(b.employment)}`:"—"}</td>
                <td style={S.td}>{b.incomeTax>0?`¥${fmt(b.incomeTax)}`:"—"}</td>
                <td style={{...S.td,color:"#fc5c65"}}>{b.totalDeduction>0?`¥${fmt(b.totalDeduction)}`:"—"}</td>
                <td style={{...S.td,fontWeight:700,color:b.netBonus>0?"#00c9a7":"#333"}}>{b.netBonus>0?`¥${fmt(b.netBonus)}`:"—"}</td>
              </tr>
            ))}
            <tr style={{background:"#fff8e1",fontWeight:700}}>
              <td style={S.td} colSpan={4}>合計（{rows.filter(r=>r.b.bonusAmount>0).length}名）</td>
              <td style={{...S.td,color:"#f7b731"}}>¥{fmt(totals.gross)}</td>
              <td colSpan={5} style={S.td}></td>
              <td style={S.td}></td>
              <td style={{...S.td,color:"#00c9a7"}}>¥{fmt(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// BONUS SLIP（賞与計算と連動）
// ============================================================
function BonusSlip({ employees, settings, selectedMonth, setSelectedMonth, getBonus }) {
  const [selected, setSelected] = useState(employees[0]?.id);
  const emp = employees.find(e=>e.id===selected)||employees[0];
  const bd = getBonus(selectedMonth);
  const bonusAmount = bd.data?.[emp?.id]?.bonus||0;
  const b = emp ? calcBonusAmount(emp, bonusAmount) : null;

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>賞与明細書</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
          <select style={S.formInput} value={selected} onChange={e=>setSelected(Number(e.target.value))}>
            {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:""}{e.name}</option>)}
          </select>
          {bd.payDate&&<span style={{fontSize:12,padding:"5px 10px",background:"#f0edff",borderRadius:8,color:"#6c63ff",fontWeight:600}}>支給日: {bd.payDate}</span>}
        </div>
      </div>
      {emp&&b&&(
        <div style={{...S.payslipCard,maxWidth:520}}>
          <div style={S.payslipHeader}>
            <div><div style={S.payslipCompany}>{settings.companyName}</div><div style={S.payslipTitle}>賞 与 明 細 書</div></div>
            <div style={S.payslipMeta}>
              <div style={S.payslipMonth}>{selectedMonth.replace("-","年")}月分</div>
              <div style={{...S.payslipName}}>{emp.name} 様</div>
              <div style={{fontSize:11,color:"#aaa"}}>{emp.code&&`${emp.code}　`}{emp.department}</div>
            </div>
          </div>
          {bd.payDate&&(
            <div style={{background:"#fff8e1",padding:"8px 20px",borderBottom:"1px solid #ffe08a",fontSize:12,color:"#856404"}}>
              支給日：<b>{bd.payDate}</b>
            </div>
          )}
          {bonusAmount===0&&(
            <div style={{padding:"20px",textAlign:"center",color:"#aaa",fontSize:13}}>
              賞与計算タブで賞与額を入力してください
            </div>
          )}
          {bonusAmount>0&&(
            <div style={{padding:"16px 20px"}}>
              <div style={S.sectionHeader}>支 給</div>
              <div style={S.payslipRow}><span style={S.payslipRowLabel}>賞与支給額</span><span style={{...S.payslipRowValue,color:"#f7b731",fontSize:16}}>¥{fmt(bonusAmount)}</span></div>
              <div style={{...S.sectionHeader,marginTop:16}}>控 除</div>
              {[["健康保険料",b.health],["介護保険料",b.nursing],["厚生年金保険料",b.pension],["雇用保険料",b.employment],["所得税（賞与）",b.incomeTax]].map(([label,val])=>(
                <div key={label} style={S.payslipRow}><span style={S.payslipRowLabel}>{label}</span><span style={S.payslipRowValue}>{val>0?`¥${fmt(val)}`:"—"}</span></div>
              ))}
              <div style={{...S.payslipRow,borderTop:"2px solid #1a1a2e",fontWeight:700}}><span>控除合計</span><span style={{color:"#fc5c65"}}>¥{fmt(b.totalDeduction)}</span></div>
            </div>
          )}
          {bonusAmount>0&&<div style={S.netSalaryBox}><span style={S.netLabel}>差引支給額（手取り）</span><span style={S.netValue}>¥{fmt(b.netBonus)}</span></div>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// LEDGER VIEW（月次 + 年次）
// ============================================================
function LedgerView({ employees, settings, getMI, getAtt, getBonus, selectedMonth, setSelectedMonth, onPrint }) {
  const [ledgerMode,   setLedgerMode]   = useState("monthly"); // monthly | yearly
  const [selectedEmpId, setSelectedEmpId] = useState("all");   // "all" or empId
  const selectedYear = selectedMonth.slice(0,4);

  // 月次：従業員フィルター
  const mi=getMI(selectedMonth); const att=getAtt(selectedMonth);
  const monthTarget = selectedEmpId==="all" ? employees : employees.filter(e=>e.id===Number(selectedEmpId));
  const monthRows = useMemo(()=>monthTarget.map(e=>({emp:e,p:calcPayroll(e,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id])})),[monthTarget,selectedMonth,settings,mi,att]);
  const monthTotals = useMemo(()=>monthRows.reduce((a,{p})=>({gross:a.gross+p.grossSalary,deduct:a.deduct+p.totalDeduction,net:a.net+p.netSalary,inc:a.inc+p.incentiveTotal}),{gross:0,deduct:0,net:0,inc:0}),[monthRows]);

  // 年次：全員集計 or 個人別12ヶ月展開
  const MONTHS_12 = useMemo(()=>Array.from({length:12},(_,i)=>`${selectedYear}-${String(i+1).padStart(2,"0")}`),[selectedYear]);

  // 全員モード：1人1行（年間集計）
  const yearRows = useMemo(()=>{
    const target = selectedEmpId==="all" ? employees : employees.filter(e=>e.id===Number(selectedEmpId));
    return target.map(e=>{
      let gross=0,deduct=0,net=0,inc=0,health=0,nursing=0,pension=0,employment=0,incomeTax=0,residentTax=0;
      let bonusGross=0,bonusDeduct=0,bonusNet=0;
      MONTHS_12.forEach(m=>{
        const p=calcPayroll(e,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[e.id]);
        gross+=p.grossSalary; deduct+=p.totalDeduction; net+=p.netSalary; inc+=p.incentiveTotal;
        health+=p.health; nursing+=p.nursing; pension+=p.pension; employment+=p.employment;
        incomeTax+=p.incomeTax; residentTax+=p.residentTax;
        // 賞与
        const bAmt = getBonus(m)?.data?.[e.id]?.bonus||0;
        if (bAmt>0) {
          const b=calcBonusAmount(e,bAmt);
          bonusGross+=b.bonusAmount; bonusDeduct+=b.totalDeduction; bonusNet+=b.netBonus;
          health+=b.health; nursing+=b.nursing; pension+=b.pension; employment+=b.employment;
          incomeTax+=b.incomeTax; deduct+=b.totalDeduction;
        }
      });
      return {emp:e,gross,deduct,net,inc,health,nursing,pension,employment,incomeTax,residentTax,bonusGross,bonusDeduct,bonusNet};
    });
  },[employees,selectedEmpId,selectedYear,settings,getMI,getAtt,getBonus,MONTHS_12]);

  // 個人選択時：1〜12月の月別展開（賞与含む）
  const empMonthRows = useMemo(()=>{
    if (selectedEmpId==="all") return [];
    const e = employees.find(emp=>emp.id===Number(selectedEmpId));
    if (!e) return [];
    return MONTHS_12.map(m=>{
      const p=calcPayroll(e,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[e.id]);
      const bAmt = getBonus(m)?.data?.[e.id]?.bonus||0;
      const b = bAmt>0 ? calcBonusAmount(e,bAmt) : null;
      const payDate = getBonus(m)?.payDate||"";
      return {month:m, p, bonus:b, bonusAmt:bAmt, payDate};
    });
  },[selectedEmpId,employees,MONTHS_12,settings,getMI,getAtt,getBonus]);
  const empMonthTotals = useMemo(()=>empMonthRows.reduce((a,{p,bonus})=>({
    gross:a.gross+p.grossSalary+(bonus?.bonusAmount||0),
    deduct:a.deduct+p.totalDeduction+(bonus?.totalDeduction||0),
    net:a.net+p.netSalary+(bonus?.netBonus||0),
    incomeTax:a.incomeTax+p.incomeTax+(bonus?.incomeTax||0),
    bonusGross:a.bonusGross+(bonus?.bonusAmount||0),
  }),{gross:0,deduct:0,net:0,incomeTax:0,bonusGross:0}),[empMonthRows]);

  const yearTotals = useMemo(()=>yearRows.reduce((a,r)=>({gross:a.gross+r.gross,deduct:a.deduct+r.deduct,net:a.net+r.net,inc:a.inc+r.inc,incomeTax:a.incomeTax+r.incomeTax}),{gross:0,deduct:0,net:0,inc:0,incomeTax:0}),[yearRows]);

  const TH_MONTH = ["氏名","部署","雇用","基本給","残業代","インセンティブ","各手当","総支給","健保","介護","厚年","雇保","所得税","住民税","控除計","手取り"];
  const TH_YEAR  = ["氏名","部署","雇用形態","給与総支給","賞与支給","年間総支給","健保計","介護計","厚年計","雇保計","所得税計","住民税計","控除合計","年間手取り"];
  const TH_EMP   = ["月","基本給","残業代","インセンティブ","各手当","総支給","健保","介護","厚年","雇保","所得税","住民税","控除計","手取り"];

  const selectedEmp = employees.find(e=>e.id===Number(selectedEmpId));

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>賃金台帳</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {/* 月次/年次切替 */}
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #ddd"}}>
            <button style={{padding:"7px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:ledgerMode==="monthly"?700:400,background:ledgerMode==="monthly"?"#6c63ff":"white",color:ledgerMode==="monthly"?"white":"#666"}} onClick={()=>setLedgerMode("monthly")}>月次</button>
            <button style={{padding:"7px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:ledgerMode==="yearly"?700:400,background:ledgerMode==="yearly"?"#6c63ff":"white",color:ledgerMode==="yearly"?"white":"#666"}} onClick={()=>setLedgerMode("yearly")}>年次</button>
          </div>
          {/* 従業員選択 */}
          <select style={{...S.formInput,width:"auto",maxWidth:160}} value={selectedEmpId} onChange={e=>setSelectedEmpId(e.target.value)}>
            <option value="all">全員</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:''}{e.name}</option>)}
          </select>
          {/* 期間 */}
          {ledgerMode==="monthly"
            ? <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
            : <div style={{display:"flex",alignItems:"center",gap:6}}>
                <select style={{...S.formInput,width:"auto"}} value={selectedYear} onChange={e=>setSelectedMonth(`${e.target.value}-01`)}>
                  {["2024","2023","2022"].map(y=><option key={y}>{y}</option>)}
                </select>
                <span style={{fontSize:12,color:"#666"}}>年</span>
              </div>
          }
          <button style={S.primaryBtn} onClick={()=>{
            if (ledgerMode==="monthly") {
              onPrint(selectedEmpId==="all"?employees:employees.filter(e=>e.id===Number(selectedEmpId)), selectedMonth, settings, settings.incentiveMasters, mi, att);
            } else if (ledgerMode==="yearly" && selectedEmpId!=="all" && selectedEmp) {
              printLedgerEmpYearly(selectedEmp, selectedYear, settings, getMI, getAtt, getBonus);
            } else {
              printLedgerYearly(selectedEmpId==="all"?employees:employees.filter(e=>e.id===Number(selectedEmpId)), selectedYear, settings, getMI, getAtt, getBonus);
            }
          }}>📋 PDF印刷</button>
        </div>
      </div>

      {/* サマリーバー */}
      <div style={{marginBottom:12,padding:"10px 16px",background:"#1a1a2e",color:"white",borderRadius:8,display:"flex",gap:24,flexWrap:"wrap",fontSize:13}}>
        {ledgerMode==="monthly" ? <>
          <span>対象年月: <b>{selectedMonth.replace("-","年")}月</b></span>
          <span>対象: <b>{selectedEmpId==="all"?`全員（${employees.length}名）`:selectedEmp?.name}</b></span>
          <span>総支給計: <b>¥{fmt(monthTotals.gross)}</b></span>
          <span>インセンティブ計: <b style={{color:"#fc5c65"}}>¥{fmt(monthTotals.inc)}</b></span>
          <span>差引支給計: <b style={{color:"#00c9a7"}}>¥{fmt(monthTotals.net)}</b></span>
        </> : <>
          <span>対象年: <b>{selectedYear}年（1〜12月）</b></span>
          <span>対象: <b>{selectedEmpId==="all"?`全員（${employees.length}名）`:selectedEmp?.name}</b></span>
          <span>年間総支給計: <b>¥{fmt(selectedEmpId==="all"?yearTotals.gross:empMonthTotals.gross)}</b></span>
          <span>年間源泉税計: <b style={{color:"#fc5c65"}}>¥{fmt(selectedEmpId==="all"?yearTotals.incomeTax:empMonthTotals.incomeTax)}</b></span>
          <span>年間手取り計: <b style={{color:"#00c9a7"}}>¥{fmt(selectedEmpId==="all"?yearTotals.net:empMonthTotals.net)}</b></span>
        </>}
      </div>

      {/* 月次テーブル */}
      {ledgerMode==="monthly" && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{TH_MONTH.map(h=><th key={h} style={{...S.th,fontSize:10,padding:"6px 5px"}}>{h}</th>)}</tr></thead>
            <tbody>
              {monthRows.map(({emp,p})=>(
                <tr key={emp.id} style={S.tr}>
                  <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>{emp.name}</td>
                  <td style={{...S.td,fontSize:11}}>{emp.department}</td>
                  <td style={{...S.td,fontSize:10}}>{emp.employmentType}</td>
                  <td style={{...S.td,fontSize:11}}>{fmt(p.baseSalary)}</td>
                  <td style={{...S.td,fontSize:11}}>{p.overtimePay>0?fmt(p.overtimePay):"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>{p.incentiveTotal>0?fmt(p.incentiveTotal):"—"}</td>
                  <td style={{...S.td,fontSize:11}}>{fmt(p.transportAllowance+p.housingAllowance+p.otherAllowance)||"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>{fmt(p.grossSalary)}</td>
                  {[p.health,p.nursing,p.pension,p.employment,p.incomeTax,p.residentTax].map((v,i)=><td key={i} style={{...S.td,fontSize:11}}>{v>0?fmt(v):"—"}</td>)}
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(p.totalDeduction)}</td>
                  <td style={{...S.td,fontWeight:700}}>{fmt(p.netSalary)}</td>
                </tr>
              ))}
              {selectedEmpId==="all"&&(
                <tr style={{background:"#f0f4ff",fontWeight:700}}>
                  <td style={S.td} colSpan={4}>合計（{monthRows.length}名）</td>
                  <td style={S.td}></td>
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(monthTotals.inc)}</td>
                  <td style={S.td}></td>
                  <td style={{...S.td,color:"#00c9a7"}}>{fmt(monthTotals.gross)}</td>
                  <td colSpan={6} style={S.td}></td>
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(monthTotals.deduct)}</td>
                  <td style={S.td}>{fmt(monthTotals.net)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 年次：全員テーブル */}
      {ledgerMode==="yearly" && selectedEmpId==="all" && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{TH_YEAR.map(h=><th key={h} style={{...S.th,fontSize:10,padding:"6px 5px"}}>{h}</th>)}</tr></thead>
            <tbody>
              {yearRows.map(r=>(
                <tr key={r.emp.id} style={S.tr}>
                  <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>{r.emp.name}</td>
                  <td style={{...S.td,fontSize:11}}>{r.emp.department}</td>
                  <td style={{...S.td,fontSize:10}}>{r.emp.employmentType}</td>
                  <td style={{...S.td,fontSize:11}}>{fmt(r.gross)}</td>
                  <td style={{...S.td,color:"#f7b731",fontWeight:r.bonusGross>0?700:400}}>{r.bonusGross>0?fmt(r.bonusGross):"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>{fmt(r.gross+r.bonusGross)}</td>
                  {[r.health,r.nursing,r.pension,r.employment,r.incomeTax,r.residentTax].map((v,i)=>(
                    <td key={i} style={{...S.td,fontSize:11}}>{v>0?fmt(v):"—"}</td>
                  ))}
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(r.deduct)}</td>
                  <td style={{...S.td,fontWeight:700}}>{fmt(r.net+r.bonusNet)}</td>
                </tr>
              ))}
              <tr style={{background:"#f0f4ff",fontWeight:700}}>
                <td style={S.td} colSpan={3}>合計（{yearRows.length}名）</td>
                <td style={S.td}>{fmt(yearTotals.gross)}</td>
                <td style={{...S.td,color:"#f7b731"}}>{fmt(yearRows.reduce((s,r)=>s+r.bonusGross,0))}</td>
                <td style={{...S.td,color:"#00c9a7"}}>{fmt(yearTotals.gross+yearRows.reduce((s,r)=>s+r.bonusGross,0))}</td>
                <td colSpan={6} style={S.td}></td>
                <td style={{...S.td,color:"#fc5c65"}}>{fmt(yearTotals.deduct)}</td>
                <td style={S.td}>{fmt(yearTotals.net+yearRows.reduce((s,r)=>s+r.bonusNet,0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 年次：個人別 1〜12月展開 */}
      {ledgerMode==="yearly" && selectedEmpId!=="all" && selectedEmp && (
        <div>
          <div style={{marginBottom:10,padding:"8px 14px",background:"#f0edff",borderRadius:8,fontSize:12,color:"#6c63ff"}}>
            <b>{selectedEmp.name}</b>（{selectedEmp.department}・{selectedEmp.employmentType}）　{selectedYear}年 月別明細
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead><tr>{TH_EMP.map(h=><th key={h} style={{...S.th,fontSize:10,padding:"6px 5px"}}>{h}</th>)}</tr></thead>
              <tbody>
                {/* 月別給与行 */}
                {empMonthRows.map(({month,p})=>(
                  <tr key={month} style={S.tr}>
                    <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>{month.replace("-","年")}月</td>
                    <td style={{...S.td,fontSize:11}}>{fmt(p.baseSalary)}</td>
                    <td style={{...S.td,fontSize:11}}>{p.overtimePay>0?fmt(p.overtimePay):"—"}</td>
                    <td style={{...S.td,color:"#fc5c65"}}>{p.incentiveTotal>0?fmt(p.incentiveTotal):"—"}</td>
                    <td style={{...S.td,fontSize:11}}>{fmt(p.transportAllowance+p.housingAllowance+p.otherAllowance)||"—"}</td>
                    <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>{fmt(p.grossSalary)}</td>
                    {[p.health,p.nursing,p.pension,p.employment,p.incomeTax,p.residentTax].map((v,i)=>(
                      <td key={i} style={{...S.td,fontSize:11}}>{v>0?fmt(v):"—"}</td>
                    ))}
                    <td style={{...S.td,color:"#fc5c65"}}>{fmt(p.totalDeduction)}</td>
                    <td style={{...S.td,fontWeight:700}}>{fmt(p.netSalary)}</td>
                  </tr>
                ))}

                {/* ── 給与合計 ── */}
                {(()=>{
                  const sg = empMonthRows.reduce((a,{p})=>({
                    base:a.base+p.baseSalary, ot:a.ot+p.overtimePay, inc:a.inc+p.incentiveTotal,
                    allow:a.allow+(p.transportAllowance+p.housingAllowance+p.otherAllowance),
                    gross:a.gross+p.grossSalary,
                    health:a.health+p.health, nursing:a.nursing+p.nursing,
                    pension:a.pension+p.pension, employment:a.employment+p.employment,
                    incomeTax:a.incomeTax+p.incomeTax, residentTax:a.residentTax+p.residentTax,
                    deduct:a.deduct+p.totalDeduction, net:a.net+p.netSalary,
                  }),{base:0,ot:0,inc:0,allow:0,gross:0,health:0,nursing:0,pension:0,employment:0,incomeTax:0,residentTax:0,deduct:0,net:0});
                  return (
                    <tr style={{background:"#e8f0ff",fontWeight:700,borderTop:"2px solid #6c63ff"}}>
                      <td style={{...S.td,color:"#6c63ff",whiteSpace:"nowrap"}}>給与合計</td>
                      <td style={{...S.td,fontSize:11}}>{fmt(sg.base)}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.ot>0?fmt(sg.ot):"—"}</td>
                      <td style={{...S.td,color:"#fc5c65"}}>{sg.inc>0?fmt(sg.inc):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.allow>0?fmt(sg.allow):"—"}</td>
                      <td style={{...S.td,color:"#00c9a7"}}>{fmt(sg.gross)}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.health>0?fmt(sg.health):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.nursing>0?fmt(sg.nursing):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.pension>0?fmt(sg.pension):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.employment>0?fmt(sg.employment):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.incomeTax>0?fmt(sg.incomeTax):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.residentTax>0?fmt(sg.residentTax):"—"}</td>
                      <td style={{...S.td,color:"#fc5c65"}}>{fmt(sg.deduct)}</td>
                      <td style={S.td}>{fmt(sg.net)}</td>
                    </tr>
                  );
                })()}

                {/* ── 賞与明細 + 賞与合計（賞与がある年のみ） ── */}
                {empMonthTotals.bonusGross>0&&(()=>{
                  const bonusMonths = empMonthRows.filter(r=>r.bonusAmt>0);
                  const bg = bonusMonths.reduce((a,{bonus})=>bonus?({
                    gross:   a.gross+bonus.bonusAmount,
                    health:  a.health+bonus.health,
                    nursing: a.nursing+bonus.nursing,
                    pension: a.pension+bonus.pension,
                    employment:a.employment+bonus.employment,
                    incomeTax: a.incomeTax+bonus.incomeTax,
                    deduct:  a.deduct+bonus.totalDeduction,
                    net:     a.net+bonus.netBonus,
                  }):a,{gross:0,health:0,nursing:0,pension:0,employment:0,incomeTax:0,deduct:0,net:0});
                  return (<>
                    {/* 賞与月ごとの明細行 */}
                    {bonusMonths.map(({month,bonus,bonusAmt,payDate})=>(
                      <tr key={`bonus-${month}`} style={S.tr}>
                        <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>
                          {month.replace("-","年")}月
                          <div style={{fontSize:9,color:"#6c63ff",fontWeight:600}}>賞与{payDate?` (${payDate})`:""}</div>
                        </td>
                        <td colSpan={4} style={{...S.td,fontWeight:700,fontSize:12}}>
                          支給額　¥{fmt(bonusAmt)}
                        </td>
                        <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>¥{fmt(bonusAmt)}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.health>0?fmt(bonus.health):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.nursing>0?fmt(bonus.nursing):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.pension>0?fmt(bonus.pension):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.employment>0?fmt(bonus.employment):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.incomeTax>0?fmt(bonus.incomeTax):"—"}</td>
                        <td style={S.td}>—</td>
                        <td style={{...S.td,color:"#fc5c65"}}>{fmt(bonus.totalDeduction)}</td>
                        <td style={{...S.td,fontWeight:700}}>{fmt(bonus.netBonus)}</td>
                      </tr>
                    ))}
                    {/* 賞与合計行 */}
                    <tr style={{background:"#fff3cd",fontWeight:700,borderTop:"2px solid #f7b731"}}>
                      <td style={{...S.td,fontWeight:700,whiteSpace:"nowrap"}}>賞与合計</td>
                      <td colSpan={4} style={{...S.td,fontSize:11,color:"#888"}}>
                        {bonusMonths.length}回分
                      </td>
                      <td style={{...S.td,color:"#f7b731"}}>{fmt(bg.gross)}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.health>0?fmt(bg.health):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.nursing>0?fmt(bg.nursing):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.pension>0?fmt(bg.pension):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.employment>0?fmt(bg.employment):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.incomeTax>0?fmt(bg.incomeTax):"—"}</td>
                      <td style={S.td}>—</td>
                      <td style={{...S.td,color:"#fc5c65"}}>{fmt(bg.deduct)}</td>
                      <td style={S.td}>{fmt(bg.net)}</td>
                    </tr>
                  </>);
                })()}

                {/* ── 年間総合計 ── */}
                <tr style={{background:"#1a1a2e",fontWeight:700,borderTop:"2px solid #1a1a2e"}}>
                  {["年間合計","","","",""].map((v,i)=>(
                    <td key={i} style={{...S.td,color:"white",fontSize:i===0?12:11}}>{v}</td>
                  ))}
                  <td style={{...S.td,color:"#00c9a7",fontWeight:900}}>{fmt(empMonthTotals.gross)}</td>
                  {[0,1,2,3,4,5].map(i=><td key={i} style={{...S.td,color:"#aaa",fontSize:10}}>
                    {fmt([
                      empMonthRows.reduce((s,{p,bonus})=>s+p.health+(bonus?.health||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.nursing+(bonus?.nursing||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.pension+(bonus?.pension||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.employment+(bonus?.employment||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.incomeTax+(bonus?.incomeTax||0),0),
                      empMonthRows.reduce((s,{p})=>s+p.residentTax,0),
                    ][i])||"—"}
                  </td>)}
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(empMonthTotals.deduct)}</td>
                  <td style={{...S.td,color:"#00c9a7",fontWeight:900}}>{fmt(empMonthTotals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// WITHHOLDING TAX
// ============================================================
// 次の納付日を計算するヘルパー
function calcNextDeadline(today, payType) {
  const t = new Date(today);
  const y = t.getFullYear(), m = t.getMonth()+1;
  if (payType !== "special") {
    // 毎月納付：翌月10日
    const nm = m===12 ? 1 : m+1;
    const ny = m===12 ? y+1 : y;
    return `${ny}-${String(nm).padStart(2,"0")}-10`;
  } else {
    // 納期特例：1〜6月分→7/10、7〜12月分→翌1/20
    if (m>=1 && m<=6)  return `${y}-07-10`;
    return `${y+1}-01-20`;
  }
}
// どの月が次の納付対象かを返す
function calcNextPeriod(today, payType) {
  const t = new Date(today), m = t.getMonth()+1, y = t.getFullYear();
  if (payType !== "special") {
    // 当月分が翌月10日納付
    return [`${y}-${String(m).padStart(2,"0")}`];
  } else {
    if (m>=1 && m<=6)  return [1,2,3,4,5,6].map(mm=>`${y}-${String(mm).padStart(2,"0")}`);
    return [7,8,9,10,11,12].map(mm=>`${y}-${String(mm).padStart(2,"0")}`);
  }
}

function WithholdingTax({ employees, settings, getMI, getAtt, selectedMonth, setSelectedMonth }) {
  const TODAY = "2024-07-01"; // デモ用固定日付
  const isSpecial = settings.withholdingPayType === "special";

  const months = useMemo(()=>{
    const list=[];
    for(let i=0;i<12;i++){
      const d=new Date(selectedMonth+"-01");
      d.setMonth(d.getMonth()-i);
      list.push(d.toISOString().slice(0,7));
    }
    return list;
  },[selectedMonth]);

  const monthRows = useMemo(()=>months.map(m=>{
    const mi=getMI(m); const att=getAtt(m);
    const total=employees.reduce((s,e)=>{
      const p=calcPayroll(e,m,settings,settings.incentiveMasters,mi,att[e.id]);
      return s+p.incomeTax;
    },0);
    return { month:m, incomeTax:total };
  }),[months,employees,settings]);

  const yearTotal = monthRows.reduce((s,r)=>s+r.incomeTax,0);

  // 次の納付日と金額
  const nextDeadline = calcNextDeadline(TODAY, settings.withholdingPayType);
  const nextPeriodMonths = calcNextPeriod(TODAY, settings.withholdingPayType);
  const nextAmount = nextPeriodMonths.reduce((s,m)=>s+(monthRows.find(r=>r.month===m)?.incomeTax||0),0);
  const nextPeriodLabel = isSpecial
    ? `${nextPeriodMonths[0].slice(5,7).replace(/^0/,"")}〜${nextPeriodMonths[nextPeriodMonths.length-1].slice(5,7).replace(/^0/,"")}月分`
    : `${nextPeriodMonths[0].replace("-","年")}月分`;

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>源泉管理</h2>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
      </div>
      {/* 次の納付サマリー */}
      <div style={{marginBottom:16,padding:"14px 20px",background:"linear-gradient(135deg,#1a1a2e,#2d2d5e)",borderRadius:12,color:"white",display:"flex",gap:32,flexWrap:"wrap",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>📅 次の納付期限</div>
          <div style={{fontSize:20,fontWeight:900,color:"#f7b731"}}>{nextDeadline}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{nextPeriodLabel}（{isSpecial?"納期特例":"毎月納付"}）</div>
        </div>
        <div style={{width:1,height:48,background:"#ffffff20"}}/>
        <div>
          <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>💴 次回納付金額</div>
          <div style={{fontSize:20,fontWeight:900,color:"#fc5c65"}}>¥{fmt(nextAmount)}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>源泉所得税合計</div>
        </div>
        <div style={{width:1,height:48,background:"#ffffff20"}}/>
        <div>
          <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>納付方法</div>
          <div style={{fontSize:14,fontWeight:700,color:"white"}}>{isSpecial?"納期特例（半年納付）":"毎月納付（翌月10日）"}</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>設定タブで変更可</div>
        </div>
      </div>
      <div style={S.statsGrid}>
        {[
          {label:"今月の預かり源泉税",   value:`¥${fmt(monthRows[0]?.incomeTax||0)}`, color:"#fc5c65"},
          {label:"直近12ヶ月 源泉合計",  value:`¥${fmt(yearTotal)}`,                  color:"#6c63ff"},
          {label:"対象従業員数",          value:`${employees.length}名`,               color:"#00c9a7"},
        ].map(s=><div key={s.label} style={{...S.statCard,borderTopColor:s.color}}><div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div><div style={S.statLabel}>{s.label}</div></div>)}
      </div>

      {/* 今月の従業員別内訳 */}
      <div style={{...S.card,marginBottom:16}}>
        <h3 style={S.cardTitle}>📋 {selectedMonth} 従業員別 源泉所得税内訳</h3>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{["氏名","部署","雇用形態","総支給額","課税対象額","源泉所得税"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {employees.map(e=>{
                const mi=getMI(selectedMonth); const att=getAtt(selectedMonth);
                const p=calcPayroll(e,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id]);
                const taxBase=p.grossSalary-p.transportAllowance-p.health-p.nursing-p.pension;
                return (
                  <tr key={e.id} style={S.tr}>
                    <td style={{...S.td,fontWeight:600}}>{e.name}</td>
                    <td style={S.td}>{e.department}</td>
                    <td style={S.td}><span style={S.typeBadge}>{e.employmentType}</span></td>
                    <td style={S.td}>¥{fmt(p.grossSalary)}</td>
                    <td style={S.td}>¥{fmt(taxBase)}</td>
                    <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>¥{fmt(p.incomeTax)}</td>
                  </tr>
                );
              })}
              <tr style={{background:"#f0f4ff",fontWeight:700}}>
                <td style={S.td} colSpan={5}>合計</td>
                <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(monthRows[0]?.incomeTax||0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 月別推移 */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>📅 月別 源泉所得税 推移（直近12ヶ月）</h3>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{[settings.withholdingPayType==="special"?"対象期間":"対象年月","預かり源泉税額",settings.withholdingPayType==="special"?"納付期限":"納付期限（翌月10日）","ステータス"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(()=>{
                const isSpecial = settings.withholdingPayType==="special";
                if (!isSpecial) {
                  // 毎月納付：翌月10日
                  return monthRows.map(r=>{
                    const d=new Date(r.month+"-01");
                    d.setMonth(d.getMonth()+1);
                    const deadline=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-10`;
                    const isPast=new Date(deadline)<new Date("2024-07-01");
                    return (
                      <tr key={r.month} style={S.tr}>
                        <td style={{...S.td,fontWeight:r.month===selectedMonth?700:400}}>{r.month.replace("-","年")}月</td>
                        <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>¥{fmt(r.incomeTax)}</td>
                        <td style={S.td}>{deadline}</td>
                        <td style={S.td}>
                          <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background:isPast?"#e8f8f0":"#fff8e1",color:isPast?"#2e7d32":"#e07000"}}>
                            {isPast?"✓ 納付済み":"⏳ 未納付"}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                } else {
                  // 納期特例：半期ごとにまとめる
                  const year = selectedMonth.slice(0,4);
                  const groups = [
                    { label:`${year}年 1〜6月分`, months:[1,2,3,4,5,6], deadline:`${year}-07-10`,   isPast:new Date(`${year}-07-10`)<new Date("2024-07-11") },
                    { label:`${year}年 7〜12月分`,months:[7,8,9,10,11,12],deadline:`${Number(year)+1}-01-20`, isPast:false },
                  ];
                  return groups.map(g=>{
                    const total = g.months.reduce((s,m)=>{
                      const mo=`${year}-${String(m).padStart(2,"0")}`;
                      return s+(monthRows.find(r=>r.month===mo)?.incomeTax||0);
                    },0);
                    return (
                      <tr key={g.label} style={S.tr}>
                        <td style={{...S.td,fontWeight:600}}>{g.label}</td>
                        <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>¥{fmt(total)}</td>
                        <td style={{...S.td,fontWeight:600}}>{g.deadline}</td>
                        <td style={S.td}>
                          <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background:g.isPast?"#e8f8f0":"#fff8e1",color:g.isPast?"#2e7d32":"#e07000"}}>
                            {g.isPast?"✓ 納付済み":"⏳ 未納付"}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                }
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
function MonthPicker({ value, onChange }) {
  return <input type="month" style={{...S.formInput,width:"auto"}} value={value} onChange={e=>onChange(e.target.value)}/>;
}

// ============================================================
// STYLES
// ============================================================
const S = {
  root:{display:"flex",minHeight:"100vh",background:"#f4f6fb",fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",position:"relative"},
  mobileOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99},
  mainWrap:{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"},
  mobileHeader:{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"#1a1a2e",position:"sticky",top:0,zIndex:50},
  hamburger:{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",gap:5,padding:4},
  hamLine:{display:"block",width:22,height:2,background:"white",borderRadius:2},
  mobileTitle:{color:"white",fontWeight:800,fontSize:15,flex:1},
  mobileTabLabel:{color:"#aaa",fontSize:12,whiteSpace:"nowrap"},
  sidebar:{width:220,background:"#1a1a2e",display:"flex",flexDirection:"column",padding:"20px 12px",gap:2,minHeight:"100vh",flexShrink:0},
  sidebarLogo:{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"0 4px"},
  logoMark:{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#6c63ff,#00c9a7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"white"},
  logoTitle:{color:"white",fontWeight:800,fontSize:16},
  logoSub:{color:"#888",fontSize:10},
  companyBadge:{background:"#ffffff15",color:"#ccc",fontSize:10,padding:"6px 10px",borderRadius:6,marginBottom:10,lineHeight:1.4},
  navBtn:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,border:"none",background:"transparent",color:"#aaa",fontSize:12,cursor:"pointer",textAlign:"left",width:"100%"},
  navBtnActive:{background:"#ffffff15",color:"white",fontWeight:600},
  logoutBtn:{padding:"8px 12px",borderRadius:8,border:"1px solid #333",background:"transparent",color:"#888",fontSize:12,cursor:"pointer",marginTop:8},
  main:{flex:1,overflow:"auto"},
  page:{padding:24,maxWidth:1200},
  pageHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10},
  pageTitle:{fontSize:20,fontWeight:800,color:"#1a1a2e",margin:0},
  statsGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20},
  statCard:{background:"white",borderRadius:12,padding:"14px 16px",borderTop:"4px solid #6c63ff",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  statValue:{fontSize:20,fontWeight:800},
  statLabel:{fontSize:12,color:"#444",marginTop:4,fontWeight:600},
  statSub:{fontSize:11,color:"#aaa",marginTop:2},
  twoCol:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16},
  card:{background:"white",borderRadius:12,padding:"16px 18px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},
  cardTitle:{fontSize:13,fontWeight:700,color:"#1a1a2e",marginBottom:12,marginTop:0},
  barRow:{display:"flex",alignItems:"center",gap:8,marginBottom:8},
  barLabel:{fontSize:12,color:"#555",width:56,flexShrink:0},
  barTrack:{flex:1,height:8,background:"#f0f0f0",borderRadius:4,overflow:"hidden"},
  barFill:{height:"100%",background:"linear-gradient(90deg,#6c63ff,#00c9a7)",borderRadius:4},
  barCnt:{fontSize:12,color:"#888",width:28,textAlign:"right"},
  tableWrap:{background:"white",borderRadius:12,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",overflow:"auto"},
  table:{width:"100%",borderCollapse:"collapse"},
  th:{background:"#1a1a2e",color:"white",padding:"10px 12px",fontSize:12,textAlign:"left",whiteSpace:"nowrap"},
  tr:{borderBottom:"1px solid #f0f0f0"},
  td:{padding:"10px 12px",fontSize:13,color:"#333"},
  deptBadge:{display:"inline-block",padding:"2px 8px",borderRadius:20,background:"#e8f4fd",color:"#1a6db8",fontSize:11,fontWeight:600},
  typeBadge:{display:"inline-block",padding:"2px 8px",borderRadius:20,background:"#f0f0f0",color:"#666",fontSize:11},
  incBadge:{display:"inline-block",padding:"2px 6px",borderRadius:4,background:"#f0edff",color:"#6c63ff",fontSize:10,fontWeight:600},
  masterTag:{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20,background:"#f0edff",color:"#6c63ff",fontSize:12,fontWeight:600},
  tagDelete:{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1},
  incToggle:{display:"inline-block",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,transition:"all 0.15s"},
  editBtn:{padding:"4px 10px",marginRight:4,borderRadius:6,border:"1px solid #6c63ff",background:"white",color:"#6c63ff",fontSize:12,cursor:"pointer"},
  deleteBtn:{padding:"4px 10px",borderRadius:6,border:"1px solid #fc5c65",background:"white",color:"#fc5c65",fontSize:12,cursor:"pointer"},
  primaryBtn:{padding:"8px 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#6c63ff,#4ecdc4)",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"},
  secondaryBtn:{padding:"8px 14px",borderRadius:8,border:"1px solid #6c63ff",background:"white",color:"#6c63ff",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"},
  cancelBtn:{padding:"8px 16px",borderRadius:8,border:"1px solid #ddd",background:"white",color:"#666",fontSize:13,cursor:"pointer"},
  searchInput:{padding:"8px 12px",borderRadius:8,border:"1px solid #ddd",fontSize:13,outline:"none",minWidth:160},
  formGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 16px"},
  formRow:{display:"flex",flexDirection:"column",gap:4},
  formLabel:{fontSize:11,color:"#666",fontWeight:600},
  formInput:{padding:"7px 10px",borderRadius:7,border:"1px solid #ddd",fontSize:13,outline:"none"},
  modalOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000},
  modal:{background:"white",borderRadius:14,padding:24,width:540,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"},
  modalTitle:{fontSize:18,fontWeight:800,marginBottom:18,marginTop:0,color:"#1a1a2e"},
  payslipCard:{background:"white",borderRadius:14,boxShadow:"0 4px 16px rgba(0,0,0,0.08)",overflow:"hidden",maxWidth:720},
  payslipHeader:{background:"#1a1a2e",color:"white",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-end"},
  payslipCompany:{fontSize:11,color:"#aaa",marginBottom:4},
  payslipTitle:{fontSize:20,fontWeight:800,letterSpacing:"0.2em"},
  payslipMeta:{textAlign:"right"},
  payslipMonth:{fontSize:11,color:"#aaa"},
  payslipName:{fontSize:16,fontWeight:700},
  payslipBody:{display:"grid",gridTemplateColumns:"1fr 1fr"},
  payslipSection:{padding:"16px 20px",borderRight:"1px solid #f0f0f0"},
  sectionHeader:{fontSize:11,fontWeight:800,color:"#6c63ff",letterSpacing:"0.15em",borderBottom:"2px solid #6c63ff",paddingBottom:6,marginBottom:10},
  payslipRow:{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px dotted #eee"},
  payslipRowLabel:{fontSize:12,color:"#555"},
  payslipRowValue:{fontSize:13,fontWeight:600},
  netSalaryBox:{background:"linear-gradient(135deg,#1a1a2e,#2d2d5e)",color:"white",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  netLabel:{fontSize:13,color:"#aaa"},
  netValue:{fontSize:26,fontWeight:900,color:"#00c9a7"},
  loginBg:{minHeight:"100vh",background:"linear-gradient(135deg,#1a1a2e 0%,#2d2d5e 50%,#1a1a2e 100%)",display:"flex",alignItems:"center",justifyContent:"center"},
  loginCard:{background:"white",borderRadius:20,padding:"40px 36px",width:360,boxShadow:"0 30px 80px rgba(0,0,0,0.4)"},
  loginLogo:{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#6c63ff,#00c9a7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"white",margin:"0 auto 12px"},
  loginTitle:{textAlign:"center",fontSize:24,fontWeight:900,color:"#1a1a2e",margin:"0 0 4px"},
  loginSub:{textAlign:"center",color:"#888",fontSize:12,marginBottom:24},
  loginField:{marginBottom:14},
  loginLabel:{display:"block",fontSize:12,fontWeight:600,color:"#555",marginBottom:4},
  loginInput:{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid #ddd",fontSize:14,outline:"none",boxSizing:"border-box"},
  loginError:{color:"#fc5c65",fontSize:12,marginBottom:10,textAlign:"center"},
  loginBtn:{width:"100%",padding:12,borderRadius:10,border:"none",background:"linear-gradient(135deg,#6c63ff,#00c9a7)",color:"white",fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:16},
  loginHint:{textAlign:"center",fontSize:11,color:"#aaa",lineHeight:1.8},
};

// ============================================================
// YEAR END ADJUSTMENT TAB
// ============================================================

// 給与所得控除額（令和6年度）
function calcKyuyoShotokuKojo(income) {
  if (income <= 1625000)  return 550000;
  if (income <= 1800000)  return Math.floor(income * 0.4 - 100000);
  if (income <= 3600000)  return Math.floor(income * 0.3 + 80000);
  if (income <= 6600000)  return Math.floor(income * 0.2 + 440000);
  if (income <= 8500000)  return Math.floor(income * 0.1 + 1100000);
  return 1950000;
}

// 基礎控除（令和6年度）
function calcKisoKojo(income) {
  if (income <= 24000000) return 480000;
  if (income <= 24500000) return 320000;
  if (income <= 25000000) return 160000;
  return 0;
}

// 配偶者控除
function calcHaigu(spouseIncome, ownIncome) {
  if (spouseIncome > 1030000) return 0;
  if (ownIncome <= 9000000)   return 380000;
  if (ownIncome <= 9500000)   return 260000;
  if (ownIncome <= 10000000)  return 130000;
  return 0;
}

// 配偶者特別控除
function calcHaiguTokubetsu(spouseIncome, ownIncome) {
  if (spouseIncome <= 1030000 || spouseIncome > 2015999) return 0;
  if (ownIncome > 10000000) return 0;
  const table = [
    [1030001,1059999,380000,260000,130000],
    [1060000,1099999,360000,240000,120000],
    [1100000,1149999,310000,210000,110000],
    [1150000,1199999,260000,180000,90000],
    [1200000,1249999,210000,140000,70000],
    [1250000,1299999,160000,110000,60000],
    [1300000,1399999,110000,80000,40000],
    [1400000,1499999,60000,40000,20000],
    [1500000,2015999,30000,20000,10000],
  ];
  for (const [lo,hi,a,b,d] of table) {
    if (spouseIncome >= lo && spouseIncome <= hi) {
      if (ownIncome <= 9000000) return a;
      if (ownIncome <= 9500000) return b;
      return d;
    }
  }
  return 0;
}

// 生命保険料控除（新制度）
function calcSeimei(paid) {
  if (paid <= 20000)  return paid;
  if (paid <= 40000)  return Math.floor(paid / 2 + 10000);
  if (paid <= 80000)  return Math.floor(paid / 4 + 20000);
  return 40000;
}

// 所得税計算（年税額用・超過累進）
function calcNenZei(taxableIncome) {
  const t = Math.floor(taxableIncome / 1000) * 1000;
  if (t <= 1950000)  return Math.floor(t * 0.05);
  if (t <= 3300000)  return Math.floor(t * 0.1  - 97500);
  if (t <= 6950000)  return Math.floor(t * 0.2  - 427500);
  if (t <= 9000000)  return Math.floor(t * 0.23 - 636000);
  if (t <= 18000000) return Math.floor(t * 0.33 - 1536000);
  if (t <= 40000000) return Math.floor(t * 0.4  - 2796000);
  return Math.floor(t * 0.45 - 4796000);
}

// 復興特別所得税込み
function calcFinalTax(nenZei) {
  return Math.floor(nenZei * 1.021);
}

function YearEndAdj({ employees, settings, getMI, getAtt, getBonus, yearEndData, setYearEndData, saveYearEnd }) {
  const [selectedYear, setSelectedYear] = useState("2024");
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || null);
  const [view, setView] = useState("list"); // list | input | result

  const emp = employees.find(e => e.id === selectedEmpId);

  // 年間給与集計（1〜12月）賞与含む
  const calcAnnual = (empId) => {
    let totalGross = 0, totalSocialIns = 0, totalWithheld = 0;
    let bonusGross = 0, bonusSocialIns = 0, bonusWithheld = 0;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return { totalGross:0, totalSocialIns:0, totalWithheld:0 };
    for (let m = 1; m <= 12; m++) {
      const month = `${selectedYear}-${String(m).padStart(2,"0")}`;
      const p = calcPayroll(emp, month, settings, settings.incentiveMasters, getMI(month), getAtt(month)[empId]);
      totalGross    += p.grossSalary;
      totalSocialIns += p.socialTotal;
      totalWithheld  += p.incomeTax;
      // 賞与
      const bAmt = getBonus(month)?.data?.[empId]?.bonus||0;
      if (bAmt>0) {
        const b = calcBonusAmount(emp, bAmt);
        bonusGross    += b.bonusAmount;
        bonusSocialIns += b.health+b.nursing+b.pension+b.employment;
        bonusWithheld  += b.incomeTax;
      }
    }
    return {
      totalGross: totalGross+bonusGross,
      totalSocialIns: totalSocialIns+bonusSocialIns,
      totalWithheld: totalWithheld+bonusWithheld,
      salaryGross: totalGross,
      bonusGross,
    };
  };

  // 年末調整計算
  const calcYearEnd = (empId) => {
    const d   = yearEndData[empId] || {};
    const ann = calcAnnual(empId);
    const emp = employees.find(e => e.id === empId);
    if (!emp) return null;

    const kyuyoShotoku = Math.max(0, ann.totalGross - calcKyuyoShotokuKojo(ann.totalGross));
    const kisoKojo     = calcKisoKojo(kyuyoShotoku);

    // 配偶者控除
    const spouseIncome = d.spouseIncome || 0;
    const haiguKojo    = d.hasSpouse
      ? (spouseIncome <= 1030000
          ? calcHaigu(spouseIncome, kyuyoShotoku)
          : calcHaiguTokubetsu(spouseIncome, kyuyoShotoku))
      : 0;

    // 扶養控除
    const dep_general  = (d.dep_general  || 0) * 380000;  // 一般扶養（16〜18、23〜69歳）
    const dep_specific = (d.dep_specific || 0) * 630000;  // 特定扶養（19〜22歳）
    const dep_elderly  = (d.dep_elderly  || 0) * 480000;  // 老人扶養（70歳以上）
    const dep_elive    = (d.dep_elive    || 0) * 580000;  // 同居老親等
    const fuyo = dep_general + dep_specific + dep_elderly + dep_elive;

    // 生命保険料控除
    const seimei_new_life  = calcSeimei(d.seimei_new_life  || 0);
    const seimei_new_annuity= calcSeimei(d.seimei_new_annuity|| 0);
    const seimei_new_care  = calcSeimei(d.seimei_new_care  || 0);
    const seimeiKojo = Math.min(120000, seimei_new_life + seimei_new_annuity + seimei_new_care);

    // 地震保険料控除
    const jishin = Math.min(50000, d.jishinHoken || 0);

    // 住宅借入金等特別控除（税額控除）
    const jutakuKojo = d.jutakuKojo || 0;

    // 障害者控除
    const shogai_general = (d.shogai_general || 0) * 270000;
    const shogai_special  = (d.shogai_special  || 0) * 400000;
    const shogai_live     = (d.shogai_live     || 0) * 750000;
    const shogaiKojo = shogai_general + shogai_special + shogai_live;

    // 寡婦・ひとり親控除
    const kabufuKojo    = d.kabufu    ? 270000 : 0;
    const hitorioyanKojo= d.hitorioyan? 350000 : 0;

    // 勤労学生控除
    const kinroGakusei = d.kinroGakusei ? 270000 : 0;

    // 小規模企業共済等
    const shoukibo = d.shoukibo || 0;

    // 社会保険料控除（月次データ自動集計）
    const shakaihoken = ann.totalSocialIns;

    // 所得控除合計
    const totalKojo = kisoKojo + haiguKojo + fuyo + seimeiKojo + jishin +
                      shogaiKojo + kabufuKojo + hitorioyanKojo + kinroGakusei +
                      shoukibo + shakaihoken;

    // 課税所得
    const kazeiShotoku = Math.max(0, kyuyoShotoku - totalKojo);

    // 年税額
    const nenZei     = calcNenZei(kazeiShotoku);
    const finalTax   = calcFinalTax(nenZei) - jutakuKojo;  // 住宅控除は税額控除
    const adjustedTax= Math.max(0, finalTax);

    // 過不足
    const diff = ann.totalWithheld - adjustedTax;  // プラス＝還付、マイナス＝追加徴収

    return {
      ...ann, kyuyoShotoku, kisoKojo, haiguKojo, fuyo,
      seimeiKojo, jishin, jutakuKojo, shogaiKojo, kabufuKojo, hitorioyanKojo,
      kinroGakusei, shoukibo, shakaihoken, totalKojo,
      kazeiShotoku, nenZei, finalTax: adjustedTax, diff,
    };
  };

  const upd = (empId, field, val) =>
    setYearEndData(prev => ({ ...prev, [empId]: { ...(prev[empId]||{}), [field]: val } }));

  const d = yearEndData[selectedEmpId] || {};
  const result = selectedEmpId ? calcYearEnd(selectedEmpId) : null;

  // 全員サマリー
  const allResults = employees.map(e => ({ emp: e, r: calcYearEnd(e.id) }));
  const totalRefund = allResults.reduce((s,{r})=> r && r.diff>0 ? s+r.diff : s, 0);
  const totalExtra  = allResults.reduce((s,{r})=> r && r.diff<0 ? s+Math.abs(r.diff) : s, 0);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>年末調整</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select style={S.formInput} value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>
            {["2024","2023","2022"].map(y=><option key={y}>{y}</option>)}
          </select>
          <span style={{fontSize:12,color:"#888"}}>年分</span>
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #ddd"}}>
            {[["list","一覧"],["input","申告入力"],["result","計算結果"]].map(([v,l])=>(
              <button key={v} style={{padding:"7px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:view===v?700:400,background:view===v?"#6c63ff":"white",color:view===v?"white":"#666"}} onClick={()=>setView(v)}>{l}</button>
            ))}
          </div>
          <button style={S.secondaryBtn} onClick={()=>printGensenchousho(employees,allResults,selectedYear,settings)}>📋 源泉徴収簿</button>
        </div>
      </div>

      {/* サマリーカード */}
      <div style={S.statsGrid}>
        {[
          {label:"対象従業員",   value:`${employees.length}名`,      color:"#6c63ff"},
          {label:"還付合計",     value:`¥${fmt(totalRefund)}`,       color:"#00c9a7"},
          {label:"追加徴収合計", value:`¥${fmt(totalExtra)}`,        color:"#fc5c65"},
          {label:"対象年",       value:`${selectedYear}年分`,         color:"#f7b731"},
        ].map(s=>(
          <div key={s.label} style={{...S.statCard,borderTopColor:s.color}}>
            <div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 一覧ビュー */}
      {view==="list" && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>{["コード","氏名","年間総支給","社保控除","徴収済税額","年税額","過不足","ステータス","操作"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {allResults.map(({emp:e,r})=>(
                <tr key={e.id} style={S.tr}>
                  <td style={{...S.td,fontSize:11,fontFamily:"monospace",color:"#888"}}>{e.code||"—"}</td>
                  <td style={{...S.td,fontWeight:600}}>{e.name}</td>
                  <td style={S.td}>¥{fmt(r?.totalGross)}</td>
                  <td style={S.td}>¥{fmt(r?.shakaihoken)}</td>
                  <td style={S.td}>¥{fmt(r?.totalWithheld)}</td>
                  <td style={{...S.td,fontWeight:700}}>¥{fmt(r?.finalTax)}</td>
                  <td style={{...S.td,fontWeight:700,color:r?.diff>0?"#00c9a7":r?.diff<0?"#fc5c65":"#333"}}>
                    {r?.diff>0?`還付 ¥${fmt(r.diff)}`:r?.diff<0?`徴収 ¥${fmt(Math.abs(r.diff))}`:"±0"}
                  </td>
                  <td style={S.td}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600,
                      background:yearEndData[e.id]?"#e8f8f0":"#fff3e0",
                      color:yearEndData[e.id]?"#2e7d32":"#e07000"}}>
                      {yearEndData[e.id]?"申告済":"未入力"}
                    </span>
                  </td>
                  <td style={S.td}>
                    <button style={S.editBtn} onClick={()=>{setSelectedEmpId(e.id);setView("input");}}>入力</button>
                    <button style={{...S.editBtn,color:"#00c9a7",borderColor:"#00c9a7"}} onClick={()=>{setSelectedEmpId(e.id);setView("result");}}>結果</button>
                    {yearEndData[e.id]&&<button style={{...S.editBtn,color:"#6c63ff",borderColor:"#6c63ff",fontSize:10}} onClick={()=>{const r=calcYearEnd(e.id);if(r)printGensenhyou(e,r,selectedYear,settings);}}>票</button>}
                    {e.retireDate&&<button style={{...S.editBtn,color:"#fc5c65",borderColor:"#fc5c65",fontSize:10}} onClick={()=>{const amt=Number(prompt(`${e.name}の退職手当等の支払金額（円）`));if(amt>0)printRetirementHyou(e,amt,settings);}}>退職票</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 申告入力ビュー */}
      {view==="input" && emp && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            <select style={{...S.formInput,width:"auto"}} value={selectedEmpId} onChange={e=>setSelectedEmpId(Number(e.target.value))}>
              {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:''}{e.name}</option>)}
            </select>
            <span style={{fontSize:12,color:"#888"}}>の申告内容を入力</span>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

            {/* 配偶者 */}
            <YESection title="👫 配偶者">
              <YECheck label="配偶者あり" checked={d.hasSpouse||false} onChange={v=>upd(selectedEmpId,"hasSpouse",v)}/>
              {d.hasSpouse && <YENum label="配偶者の年収（円）" value={d.spouseIncome||0} onChange={v=>upd(selectedEmpId,"spouseIncome",v)}/>}
            </YESection>

            {/* 扶養 */}
            <YESection title="👨‍👩‍👧 扶養控除">
              <YENum label="一般扶養人数（16〜22・23〜69歳）" value={d.dep_general||0} onChange={v=>upd(selectedEmpId,"dep_general",v)} isInt/>
              <YENum label="特定扶養人数（19〜22歳）" value={d.dep_specific||0} onChange={v=>upd(selectedEmpId,"dep_specific",v)} isInt/>
              <YENum label="老人扶養人数（70歳以上）" value={d.dep_elderly||0} onChange={v=>upd(selectedEmpId,"dep_elderly",v)} isInt/>
              <YENum label="同居老親等人数" value={d.dep_elive||0} onChange={v=>upd(selectedEmpId,"dep_elive",v)} isInt/>
            </YESection>

            {/* 生命保険料 */}
            <YESection title="🛡 生命保険料控除（新制度）">
              <YENum label="一般生命保険料（支払額）" value={d.seimei_new_life||0} onChange={v=>upd(selectedEmpId,"seimei_new_life",v)}/>
              <YENum label="介護医療保険料（支払額）" value={d.seimei_new_care||0} onChange={v=>upd(selectedEmpId,"seimei_new_care",v)}/>
              <YENum label="個人年金保険料（支払額）" value={d.seimei_new_annuity||0} onChange={v=>upd(selectedEmpId,"seimei_new_annuity",v)}/>
            </YESection>

            {/* 地震保険 */}
            <YESection title="🏠 地震保険料控除">
              <YENum label="地震保険料（支払額）" value={d.jishinHoken||0} onChange={v=>upd(selectedEmpId,"jishinHoken",v)}/>
            </YESection>

            {/* 住宅借入金 */}
            <YESection title="🏡 住宅借入金等特別控除">
              <YENum label="住宅ローン控除額（税額控除）" value={d.jutakuKojo||0} onChange={v=>upd(selectedEmpId,"jutakuKojo",v)}/>
              <div style={{fontSize:11,color:"#aaa",marginTop:4}}>※ 住宅ローン控除証明書の「控除額」をそのまま入力</div>
            </YESection>

            {/* 障害者 */}
            <YESection title="♿ 障害者控除">
              <YENum label="一般障害者人数" value={d.shogai_general||0} onChange={v=>upd(selectedEmpId,"shogai_general",v)} isInt/>
              <YENum label="特別障害者人数" value={d.shogai_special||0} onChange={v=>upd(selectedEmpId,"shogai_special",v)} isInt/>
              <YENum label="同居特別障害者人数" value={d.shogai_live||0} onChange={v=>upd(selectedEmpId,"shogai_live",v)} isInt/>
            </YESection>

            {/* その他 */}
            <YESection title="📋 その他の控除">
              <YECheck label="寡婦控除" checked={d.kabufu||false} onChange={v=>upd(selectedEmpId,"kabufu",v)}/>
              <YECheck label="ひとり親控除" checked={d.hitorioyan||false} onChange={v=>upd(selectedEmpId,"hitorioyan",v)}/>
              <YECheck label="勤労学生控除" checked={d.kinroGakusei||false} onChange={v=>upd(selectedEmpId,"kinroGakusei",v)}/>
              <YENum label="小規模企業共済等掛金（円）" value={d.shoukibo||0} onChange={v=>upd(selectedEmpId,"shoukibo",v)}/>
            </YESection>

            {/* 自動集計 */}
            {result && (
              <YESection title="📊 自動集計（月次データより）">
                <div style={{fontSize:12,color:"#666",lineHeight:2}}>
                  <div>給与年間総支給：<b>¥{fmt(result.salaryGross||result.totalGross)}</b></div>
                  {result.bonusGross>0&&<div style={{color:"#f7b731"}}>賞与年間総支給：<b>¥{fmt(result.bonusGross)}</b></div>}
                  <div style={{fontWeight:700}}>年収合計（給与＋賞与）：<b>¥{fmt(result.totalGross)}</b></div>
                  <div>社会保険料控除（自動）：<b>¥{fmt(result.shakaihoken)}</b></div>
                  <div>徴収済み源泉税：<b>¥{fmt(result.totalWithheld)}</b></div>
                </div>
              </YESection>
            )}
          </div>

          <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button style={S.primaryBtn} onClick={()=>setView("result")}>計算結果を見る →</button>
          </div>
        </div>
      )}

      {/* 計算結果ビュー */}
      {view==="result" && emp && result && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            <select style={{...S.formInput,width:"auto"}} value={selectedEmpId} onChange={e=>setSelectedEmpId(Number(e.target.value))}>
              {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:''}{e.name}</option>)}
            </select>
            <span style={{fontSize:12,color:"#888"}}>の年末調整計算結果</span>
            <button style={S.secondaryBtn} onClick={()=>setView("input")}>← 申告入力に戻る</button>
            {result&&<button style={S.primaryBtn} onClick={()=>printGensenhyou(emp,result,selectedYear,settings)}>📄 源泉徴収票</button>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* 収入・給与所得 */}
            <div style={S.card}>
              <div style={S.sectionHeader}>収入・給与所得</div>
              {[
                ["年間総支給額（収入金額）", result.totalGross],
                ["給与所得控除額",           result.totalGross - result.kyuyoShotoku],
                ["給与所得金額",             result.kyuyoShotoku],
              ].map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={S.payslipRowValue}>¥{fmt(v)}</span>
                </div>
              ))}
            </div>

            {/* 所得控除 */}
            <div style={S.card}>
              <div style={S.sectionHeader}>所得控除</div>
              {[
                ["社会保険料控除",   result.shakaihoken],
                ["基礎控除",         result.kisoKojo],
                ["配偶者（特別）控除",result.haiguKojo],
                ["扶養控除",         result.fuyo],
                ["生命保険料控除",   result.seimeiKojo],
                ["地震保険料控除",   result.jishin],
                ["障害者控除",       result.shogaiKojo],
                ["寡婦・ひとり親控除",result.kabufuKojo+result.hitorioyanKojo],
                ["勤労学生控除",     result.kinroGakusei],
                ["小規模企業共済等", result.shoukibo],
              ].filter(([,v])=>v>0).map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={S.payslipRowValue}>¥{fmt(v)}</span>
                </div>
              ))}
              <div style={{...S.payslipRow,borderTop:"2px solid #1a1a2e",fontWeight:700}}>
                <span>所得控除合計</span>
                <span style={{color:"#6c63ff"}}>¥{fmt(result.totalKojo)}</span>
              </div>
            </div>

            {/* 税額計算 */}
            <div style={S.card}>
              <div style={S.sectionHeader}>税額計算</div>
              {[
                ["課税所得金額",              result.kazeiShotoku],
                ["算出税額",                  result.nenZei],
                ["住宅借入金等特別控除",      -(result.jutakuKojo||0)],
                ["年税額（復興特別所得税込）", result.finalTax],
              ].map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={{...S.payslipRowValue,color:l.startsWith("課税")?"#333":l.startsWith("住宅")?"#00c9a7":"#333"}}>
                    {v<0?`- ¥${fmt(Math.abs(v))}`:`¥${fmt(v)}`}
                  </span>
                </div>
              ))}
            </div>

            {/* 過不足 */}
            <div style={{...S.card,border:`2px solid ${result.diff>=0?"#00c9a7":"#fc5c65"}`}}>
              <div style={{...S.sectionHeader,color:result.diff>=0?"#00c9a7":"#fc5c65",borderBottomColor:result.diff>=0?"#00c9a7":"#fc5c65"}}>
                {result.diff>=0?"💚 還付":"🔴 追加徴収"}
              </div>
              {[
                ["徴収済み源泉税合計",  result.totalWithheld],
                ["確定年税額",          result.finalTax],
              ].map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={S.payslipRowValue}>¥{fmt(v)}</span>
                </div>
              ))}
              <div style={{marginTop:12,padding:"12px 16px",background:result.diff>=0?"#e8faf5":"#fff0f0",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:result.diff>=0?"#00c9a7":"#fc5c65"}}>
                  {result.diff>=0?"還付金額":"追加徴収額"}
                </span>
                <span style={{fontSize:22,fontWeight:900,color:result.diff>=0?"#00c9a7":"#fc5c65"}}>
                  ¥{fmt(Math.abs(result.diff))}
                </span>
              </div>
              <div style={{fontSize:11,color:"#888",marginTop:8,textAlign:"center"}}>
                {result.diff>=0?"12月給与または別途で還付してください":"12月給与から追加徴収してください"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 年末調整用 小コンポーネント
function YESection({ title, children }) {
  return (
    <div style={{...S.card,padding:"14px 16px"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#1a1a2e",borderBottom:"2px solid #6c63ff",paddingBottom:6,marginBottom:10}}>{title}</div>
      {children}
    </div>
  );
}
function YECheck({ label, checked, onChange }) {
  return (
    <label style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",cursor:"pointer",fontSize:13}}>
      <input type="checkbox" style={{accentColor:"#6c63ff",width:16,height:16}} checked={checked} onChange={e=>onChange(e.target.checked)}/>
      {label}
    </label>
  );
}
function YENum({ label, value, onChange, isInt }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px dotted #eee"}}>
      <span style={{fontSize:12,color:"#555",flex:1}}>{label}</span>
      <input
        style={{...S.formInput,width:isInt?60:110,padding:"3px 8px",fontSize:12,textAlign:"right"}}
        type="number" min="0" step={isInt?1:1000}
        value={value||""}
        placeholder="0"
        onChange={e=>onChange(isInt?Math.floor(Number(e.target.value)):Number(e.target.value))}
      />
    </div>
  );
}
