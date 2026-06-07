import { RATES } from "./constants";

export const fmt = (n) => (n||0).toLocaleString("ja-JP");

export function calcBonusAmount(emp, bonusAmount) {
  const social = calcSocialInsurance(bonusAmount, emp.age||35, emp.employmentType, emp.insuranceFlags||null);
  const incomeTax = Math.floor(bonusAmount * 0.042);
  const totalDeduction = social.health+social.nursing+social.pension+social.employment+incomeTax;
  return { bonusAmount, ...social, incomeTax, totalDeduction, netBonus: bonusAmount - totalDeduction };
}

export function calcIncomeTax(taxableIncome, dependents=0) {
  const base = taxableIncome - dependents*38000;
  if (base<=0)       return 0;
  if (base<=162500)  return Math.floor(base*0.05);
  if (base<=325000)  return Math.floor(base*0.1-8125);
  if (base<=650000)  return Math.floor(base*0.2-40625);
  if (base<=1000000) return Math.floor(base*0.23-60000);
  return Math.floor(base*0.33-160000);
}

export function calcSocialInsurance(salary, age=35, employmentType="正社員", insuranceFlags=null) {
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
export function calcPayroll(emp, month, settings, incentiveMasters=[], monthlyIncentives={}, attendance=null) {
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
