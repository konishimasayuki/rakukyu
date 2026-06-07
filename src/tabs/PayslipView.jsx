import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
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

export default PayslipView;
