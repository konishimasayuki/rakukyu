import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import { EMPLOYMENT_TYPES } from "../utils/constants";
function SettingsTab({ settings, setSettings, setEmployees, employees }) {
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

export default SettingsTab;
