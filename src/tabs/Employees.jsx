import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import { EMPLOYMENT_TYPES } from "../utils/constants";
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

export { EmployeeList, EmployeeModal };
