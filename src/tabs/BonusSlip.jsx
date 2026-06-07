import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
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

export default BonusSlip;
