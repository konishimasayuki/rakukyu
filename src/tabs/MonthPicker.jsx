import {  } from "react";
import S from "../utils/styles";

function MonthPicker({ value, onChange }) {
  return <input type="month" style={{...S.formInput,width:"auto"}} value={value} onChange={e=>onChange(e.target.value)}/>;
}

// ============================================================
// STYLES
// ============================================================

export default MonthPicker;
