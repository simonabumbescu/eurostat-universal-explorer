import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Bar, AreaChart, Area
} from "recharts";

const COLORS = ["#6366F1","#EF4444","#10B981","#F59E0B","#3B82F6","#EC4899","#8B5CF6","#14B8A6","#F97316","#06B6D4"];

// URL-ul backend-ului. In dezvoltare = localhost; in productie se seteaza
// variabila de mediu REACT_APP_API_URL (ex: https://eurostat-backend.onrender.com)
const API = (process.env.REACT_APP_API_URL || "http://localhost:8000").replace(/\/$/, "");

// ============================================================
// HARTA EUROPA CU D3 — granițe reale + export html2canvas
// ============================================================
function EuropeMap({ geoLatestData, geoLabels }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const width = svgEl.clientWidth || 700;
    const height = 480;

    // Incarcam d3 dinamic daca nu e disponibil
    const drawWithD3 = (d3lib) => {
      d3lib.select(svgEl).selectAll("*").remove();
      const svg = d3lib.select(svgEl)
        .attr("viewBox", `0 0 ${width} ${height}`);

      const defs = svg.append("defs");
      const oceanGrad = defs.append("linearGradient")
        .attr("id","oceanGrad2").attr("x1","0%").attr("y1","0%").attr("x2","0%").attr("y2","100%");
      oceanGrad.append("stop").attr("offset","0%").attr("stop-color","#BFDBFE");
      oceanGrad.append("stop").attr("offset","100%").attr("stop-color","#93C5FD");
      svg.append("rect").attr("width",width).attr("height",height).attr("fill","url(#oceanGrad2)");

      const vals = Object.values(geoLatestData).filter(v=>v!=null&&isFinite(v));
      // Eliminam outlieri extremi (top/bottom 5%) pentru scala de culori mai reprezentativa
      const sorted = [...vals].sort((a,b)=>a-b);
      const p05 = sorted[Math.floor(sorted.length*0.05)] ?? sorted[0];
      const p95 = sorted[Math.floor(sorted.length*0.95)] ?? sorted[sorted.length-1];
      const minVal = p05;
      const maxVal = p95;

      const colorFn = val => {
        if (val==null) return "#CBD5E1";
        // Clampam t intre 0 si 1 — valorile outlieri primesc culoarea maxima/minima
        const tRaw = maxVal===minVal ? 0.5 : (val-minVal)/(maxVal-minVal);
        const t = Math.max(0, Math.min(1, tRaw));
        // gradient albastru->cyan->verde->galben->rosu
        const stops=[[59,130,246],[6,182,212],[34,197,94],[234,179,8],[239,68,68]];
        const scaled=t*(stops.length-1);
        const i=Math.min(Math.floor(scaled),stops.length-2);
        const f=scaled-i;
        const r=Math.round(stops[i][0]+(stops[i+1][0]-stops[i][0])*f);
        const g=Math.round(stops[i][1]+(stops[i+1][1]-stops[i][1])*f);
        const b=Math.round(stops[i][2]+(stops[i+1][2]-stops[i][2])*f);
        return `rgb(${r},${g},${b})`;
      };

      const projection = d3lib.geoNaturalEarth1()
        .scale(width*0.9).center([15,54]).translate([width/2,height/2]);
      const path = d3lib.geoPath().projection(projection);

      const numToAlpha2 = {
        "8":"AL","40":"AT","70":"BA","56":"BE","100":"BG","112":"BY",
        "756":"CH","196":"CY","203":"CZ","276":"DE","208":"DK","233":"EE",
        "724":"ES","246":"FI","250":"FR","826":"GB","300":"GR","191":"HR",
        "348":"HU","372":"IE","352":"IS","380":"IT","440":"LT","442":"LU",
        "428":"LV","498":"MD","499":"ME","807":"MK","470":"MT","528":"NL",
        "578":"NO","616":"PL","620":"PT","642":"RO","688":"RS","643":"RU",
        "752":"SE","705":"SI","703":"SK","792":"TR","804":"UA"
      };

      const GEOJSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
      d3lib.json(GEOJSON_URL).then(topoData => {
        if (!topoData) return;
        const drawMap = (topo) => {
          const countries = topo.feature(topoData, topoData.objects.countries);

          // Tari colorate
          svg.append("g").selectAll("path")
            .data(countries.features).join("path")
            .attr("d", path)
            .attr("fill", d => {
              const a2 = numToAlpha2[String(parseInt(d.id))];
              return colorFn(a2 ? geoLatestData[a2] : null);
            })
            .attr("stroke","#ffffff")
            .attr("stroke-width","0.8")
            .style("cursor","pointer")
            .on("mousemove", function(event,d) {
              const a2 = numToAlpha2[String(parseInt(d.id))];
              const val = a2 ? geoLatestData[a2] : null;
              const label = a2 ? (geoLabels[a2]||a2) : null;
              if (val!=null && label) {
                d3lib.select(this).attr("stroke","#1E3A5F").attr("stroke-width",2);
                setTooltip({x:event.clientX,y:event.clientY,label,val:val.toFixed(2)});
              }
            })
            .on("mouseleave", function() {
              d3lib.select(this).attr("stroke","#ffffff").attr("stroke-width",0.8);
              setTooltip(null);
            });

          // Etichete cu valori — rect alb + cod + valoare
          const labelG = svg.append("g");
          countries.features.forEach(d => {
            const a2 = numToAlpha2[String(parseInt(d.id))];
            if (!a2) return;
            const val = geoLatestData[a2];
            if (val==null) return;
            try {
              const c = path.centroid(d);
              if (!c||isNaN(c[0])||isNaN(c[1])) return;
              labelG.append("rect")
                .attr("x",c[0]-13).attr("y",c[1]-13)
                .attr("width",26).attr("height",19).attr("rx",2)
                .attr("fill","rgba(255,255,255,0.85)");
              labelG.append("text")
                .attr("x",c[0]).attr("y",c[1]-3)
                .attr("text-anchor","middle").attr("dominant-baseline","middle")
                .attr("font-size","7px").attr("font-weight","bold")
                .attr("font-family","Arial,sans-serif").attr("fill","#1E3A5F")
                .text(a2);
              labelG.append("text")
                .attr("x",c[0]).attr("y",c[1]+7)
                .attr("text-anchor","middle").attr("dominant-baseline","middle")
                .attr("font-size","6px").attr("font-family","Arial,sans-serif")
                .attr("fill","#374151").attr("font-weight","normal")
                .text(Number(val).toFixed(1));
            } catch(e){}
          });

          // Legenda
          const lgW=180, lgH=10, lgX=20, lgY=height-45;
          const lgGrad=defs.append("linearGradient").attr("id","lgGrad2");
          [[0,"rgb(59,130,246)"],[25,"rgb(6,182,212)"],[50,"rgb(34,197,94)"],
           [75,"rgb(234,179,8)"],[100,"rgb(239,68,68)"]].forEach(([o,c])=>{
            lgGrad.append("stop").attr("offset",`${o}%`).attr("stop-color",c);
          });
          svg.append("rect").attr("x",lgX).attr("y",lgY)
            .attr("width",lgW).attr("height",lgH).attr("rx",4)
            .attr("fill","url(#lgGrad2)").attr("stroke","#9CA3AF").attr("stroke-width",0.5);
          svg.append("text").attr("x",lgX).attr("y",lgY-4)
            .attr("font-size","9px").attr("font-family","Arial,sans-serif").attr("fill","#374151")
            .text(minVal.toFixed(1));
          svg.append("text").attr("x",lgX+lgW).attr("y",lgY-4)
            .attr("font-size","9px").attr("font-family","Arial,sans-serif")
            .attr("fill","#374151").attr("text-anchor","end").text(maxVal.toFixed(1));

          // Titlu
          svg.append("text").attr("x",width/2).attr("y",20)
            .attr("text-anchor","middle").attr("font-size","11px")
            .attr("font-weight","bold").attr("font-family","Arial,sans-serif")
            .attr("fill","#1E3A5F")
            .text("Distributie geografica — cel mai recent an disponibil");
        };

        if (window.topojson) { drawMap(window.topojson); }
        else {
          const s=document.createElement("script");
          s.src="https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js";
          s.onload=()=>drawMap(window.topojson);
          document.head.appendChild(s);
        }
      }).catch(()=>{
        d3lib.select(svgEl).append("text")
          .attr("x","50%").attr("y","50%").attr("text-anchor","middle")
          .attr("fill","#EF4444").attr("font-size","14px")
          .text("Eroare la incarcarea hartii. Verifica conexiunea.");
      });
    };

    import("d3").then(d3lib => drawWithD3(d3lib)).catch(()=>{});
  }, [geoLatestData, geoLabels]);

  const exportPNG = () => {
    const container = containerRef.current;
    if (!container) return;
    import("html2canvas").then(({default: h2c}) => {
      h2c(container, {scale:2, useCORS:true, backgroundColor:"#BFDBFE"}).then(canvas=>{
        canvas.toBlob(blob=>{
          const a=document.createElement("a");
          a.href=URL.createObjectURL(blob);
          a.download="harta_eurostat.png";
          a.click();
        },"image/png");
      });
    });
  };

  return (
    <div ref={containerRef} style={{position:"relative"}}>
      <svg ref={svgRef} style={{width:"100%",height:480,borderRadius:12,
        border:"1px solid #E5E7EB",display:"block"}}/>
      {tooltip&&(
        <div style={{position:"fixed",left:tooltip.x+14,top:tooltip.y-40,
          background:"#1F2937",color:"#fff",borderRadius:8,padding:"7px 14px",
          fontSize:13,pointerEvents:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.35)",
          zIndex:9999,whiteSpace:"nowrap"}}>
          <strong>{tooltip.label}</strong>: {tooltip.val}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
        <button onClick={exportPNG} style={{padding:"6px 14px",borderRadius:8,
          border:"1px solid #D1D5DB",background:"#fff",fontSize:13,cursor:"pointer"}}>
          ⬇ Export PNG harta
        </button>
      </div>
    </div>
  );
}

// =====================================================
// AI CHAT
// =====================================================
function AiChat({ data, stats, datasetLabel, selectedCountries, countryData, datasetId }) {
  const [messages, setMessages] = useState([{
    role:"assistant",
    content:`Salut! Sunt asistentul tau pentru analiza datelor Eurostat. Ce vrei sa stii despre **${datasetLabel}**?`
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);
  useEffect(()=>{
    setMessages([{role:"assistant",content:`Dataset schimbat la **${datasetLabel}**. Cum te pot ajuta?`}]);
  },[datasetLabel]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed||loading) return;
    const userMsg={role:"user",content:trimmed};
    const newMessages=[...messages,userMsg];
    setMessages(newMessages);
    setInput(""); setLoading(true);
    try {
      const historyForApi=newMessages.filter((m,i)=>!(i===0&&m.role==="assistant"));
      const res=await axios.post(`${API}/ai-chat`,{
        messages:historyForApi,data,stats,
        dataset_label:datasetLabel,selected_countries:selectedCountries
      });
      setMessages(prev=>[...prev,{role:"assistant",content:res.data.reply}]);
    } catch {
      setMessages(prev=>[...prev,{role:"assistant",content:"Eroare la conectarea cu AI."}]);
    }
    setLoading(false);
  };

  const handleKeyDown=e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} };

  return (
    <div style={S.chatContainer}>
      <div style={S.chatHeader}><span>🤖</span><span>Asistent AI – {datasetLabel}</span></div>
      <div style={S.messagesArea}>
        {messages.map((msg,i)=>(
          <div key={i} style={{...S.messageBubble,
            alignSelf:msg.role==="user"?"flex-end":"flex-start",
            background:msg.role==="user"?"#6366F1":"#F3F4F6",
            color:msg.role==="user"?"#fff":"#111827",
            borderBottomRightRadius:msg.role==="user"?4:16,
            borderBottomLeftRadius:msg.role==="assistant"?4:16}}>
            {msg.content.split(/(\*\*[^*]+\*\*)/).map((part,j)=>
              part.startsWith("**")&&part.endsWith("**")
                ?<strong key={j}>{part.slice(2,-2)}</strong>
                :<span key={j}>{part}</span>
            )}
          </div>
        ))}
        {loading&&(
          <div style={{...S.messageBubble,alignSelf:"flex-start",background:"#F3F4F6",color:"#6B7280"}}>
            Se gandeste...
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <div style={S.inputArea}>
        <textarea style={S.textarea} rows={2}
          placeholder="Intrebare despre date... (Enter = trimite)"
          value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={handleKeyDown} disabled={loading}/>
        <button onClick={sendMessage} disabled={loading||!input.trim()}
          style={{...S.sendBtn,opacity:loading||!input.trim()?0.5:1}}>➤</button>
      </div>
      <div style={S.suggestionsArea}>
        {["Care este tendinta generala?","Cand a fost valoarea maxima?","Compara tarile selectate"].map(q=>(
          <button key={q} style={S.suggestionBtn} onClick={()=>setInput(q)}>{q}</button>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// COUNTRY SELECTOR
// =====================================================
function CountrySelector({ countries, selected, onChange }) {
  const [search, setSearch] = useState("");
  const filtered=countries.filter(c=>
    c.label.toLowerCase().includes(search.toLowerCase())||
    c.code.toLowerCase().includes(search.toLowerCase())
  );
  const toggle=code=>onChange(
    selected.includes(code)?selected.filter(c=>c!==code):[...selected,code]
  );
  return (
    <div style={S.countrySelector}>
      <div style={S.countrySelectorHeader}>
        <span style={{fontWeight:600,fontSize:13}}>Selectie tari</span>
        <button style={S.clearBtn} onClick={()=>onChange([])}>Sterge tot</button>
      </div>
      <input style={S.searchInput} placeholder="Cauta tara..."
        value={search} onChange={e=>setSearch(e.target.value)}/>
      {selected.length>0&&(
        <div style={S.selectedTags}>
          {selected.map((code,idx)=>{
            const country=countries.find(c=>c.code===code);
            return (
              <span key={code} style={{...S.tag,background:COLORS[idx%COLORS.length]}}>
                {country?.label||code}
                <span style={{cursor:"pointer",marginLeft:4}} onClick={()=>toggle(code)}>×</span>
              </span>
            );
          })}
        </div>
      )}
      <div style={S.countryList}>
        {filtered.map(c=>(
          <label key={c.code} style={S.countryItem}>
            <input type="checkbox" checked={selected.includes(c.code)}
              onChange={()=>toggle(c.code)} style={{marginRight:8}}/>
            <span style={{fontSize:13}}>{c.label}</span>
            <span style={{fontSize:11,color:"#9CA3AF",marginLeft:4}}>({c.code})</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// MAIN APP
// =====================================================
export default function App() {
  const [categories,setCategories]=useState([]);
  const [selected,setSelected]=useState(null);
  const [selectedLabel,setSelectedLabel]=useState("");
  const [data,setData]=useState([]);
  const [countryData,setCountryData]=useState({});
  const [availableCountries,setAvailableCountries]=useState([]);
  const [selectedCountries,setSelectedCountries]=useState([]);
  const [geoLabels,setGeoLabels]=useState({});
  const [geoLatestData,setGeoLatestData]=useState({});
  const [stats,setStats]=useState({});
  const [ai,setAi]=useState("");
  const [loading,setLoading]=useState(false);
  const [showCountryPanel,setShowCountryPanel]=useState(false);
  const [chartType,setChartType]=useState("line");
  const chartRef=useRef(null);

  const loadDatasets=async()=>{
    try {
      const res=await axios.get(`${API}/datasets`);
      const cats=res.data.categories||[];
      setCategories(cats);
      if(cats.length>0&&cats[0].datasets.length>0){
        const first=cats[0].datasets[0];
        setSelected(first.id); setSelectedLabel(first.label);
      }
    } catch(err){console.error("Eroare datasets:",err);}
  };

  const loadData=async(ds,countries)=>{
    if(!ds) return;
    setLoading(true);
    try {
      const param=countries&&countries.length>0?countries.join(","):"";
      const res=await axios.get(`${API}/eurostat?dataset=${ds}&countries=${param}`);
      setData(res.data.data||[]);
      setCountryData(res.data.country_data||{});
      setStats(res.data.stats||{});
      setGeoLabels(res.data.geo_labels||{});
      if(res.data.countries&&res.data.countries.length>0)
        setAvailableCountries(res.data.countries);
      const latest={};
      Object.entries(res.data.country_data||{}).forEach(([code,rows])=>{
        if(rows.length>0) latest[code]=rows[rows.length-1].value;
      });
      setGeoLatestData(latest);
    } catch(err){console.error("Eroare Eurostat:",err);}
    setLoading(false);
  };

  const explain=async()=>{
    try {
      const res=await axios.post(`${API}/ai-explain`,{
        data:buildChartData(),dataset_label:selectedLabel,
        selected_countries:selectedCountries.map(c=>geoLabels[c]||c)
      });
      setAi(res.data.explanation);
    } catch {setAi("Eroare la AI Explain.");}
  };

  const exportPNG=()=>{
    const container=chartRef.current;
    if(!container){alert("Nu exista grafic.");return;}
    import("html2canvas").then(({default:h2c})=>{
      h2c(container,{scale:2,useCORS:true,backgroundColor:"#ffffff"}).then(canvas=>{
        canvas.toBlob(blob=>{
          const a=document.createElement("a");
          a.href=URL.createObjectURL(blob);
          a.download=`${selectedLabel.replace(/[^a-z0-9]/gi,"_")}.png`;
          a.click();
        },"image/png");
      });
    });
  };

  useEffect(()=>{loadDatasets();},[]);
  useEffect(()=>{
    if(selected){setSelectedCountries([]);setAvailableCountries([]);loadData(selected,[]);setAi("");}
  },[selected]);
  useEffect(()=>{
    if(selected){loadData(selected,selectedCountries);setAi("");}
  },[selectedCountries]);

  const handleSelectChange=e=>{
    const val=e.target.value;
    setSelected(val);
    for(const cat of categories){
      const found=cat.datasets.find(d=>d.id===val);
      if(found){setSelectedLabel(found.label);break;}
    }
  };

  const buildChartData=()=>{
    if(selectedCountries.length===0) return data;
    const yearsSet=new Set();
    selectedCountries.forEach(cc=>(countryData[cc]||[]).forEach(r=>yearsSet.add(r.year)));
    return Array.from(yearsSet).sort().map(year=>{
      const row={year};
      selectedCountries.forEach(cc=>{
        const found=(countryData[cc]||[]).find(r=>r.year===year);
        row[cc]=found?found.value:null;
      });
      return row;
    });
  };

  const chartData=buildChartData();
  const isMulti=selectedCountries.length>1;
  const isSingle=selectedCountries.length===1;
  const dataKeys=isMulti||isSingle?selectedCountries:["value"];

  const renderChart=()=>{
    const commonProps={data:chartData,margin:{top:5,right:20,left:0,bottom:5}};
    const axes=(
      <>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
        <XAxis dataKey="year" tick={{fontSize:11}}/>
        <YAxis tick={{fontSize:11}}/>
        <Tooltip formatter={(v,n)=>[v!=null?Number(v).toFixed(2):"N/A",geoLabels[n]||n]}/>
        {(isMulti||isSingle)&&<Legend formatter={n=>geoLabels[n]||n}/>}
      </>
    );
    if(chartType==="bar") return (
      <BarChart {...commonProps}>
        {axes}
        {dataKeys.map((k,i)=><Bar key={k} dataKey={k} fill={COLORS[i%COLORS.length]} radius={[3,3,0,0]}/>)}
      </BarChart>
    );
    if(chartType==="area") return (
      <AreaChart {...commonProps}>
        {axes}
        {dataKeys.map((k,i)=><Area key={k} dataKey={k} stroke={COLORS[i%COLORS.length]}
          fill={COLORS[i%COLORS.length]+"33"} strokeWidth={2} dot={false} connectNulls/>)}
      </AreaChart>
    );
    return (
      <LineChart {...commonProps}>
        {axes}
        {dataKeys.map((k,i)=><Line key={k} dataKey={k} stroke={COLORS[i%COLORS.length]}
          strokeWidth={2} dot={false} connectNulls/>)}
      </LineChart>
    );
  };

  return (
    <div style={S.app}>
      <div style={S.appHeader}>
        <h2 style={S.title}>📊 Eurostat Universal Explorer</h2>
        <span style={S.subtitle}>Date statistice europene in timp real · AI · Harta interactiva</span>
      </div>

      <div style={S.controls}>
        <select value={selected||""} onChange={handleSelectChange} style={S.select}>
          {categories.map(cat=>(
            <optgroup key={cat.label} label={cat.label}>
              {cat.datasets.map(d=>(
                <option key={cat.label+d.id} value={d.id}>{d.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button onClick={()=>loadData(selected,selectedCountries)} style={S.btn}>↻ Reload</button>
        <button onClick={()=>setShowCountryPanel(!showCountryPanel)} style={{
          ...S.btn,
          background:showCountryPanel?"#EEF2FF":"#fff",
          borderColor:showCountryPanel?"#6366F1":"#D1D5DB",
          color:showCountryPanel?"#6366F1":"#111827"
        }}>🌍 Tari {selectedCountries.length>0?`(${selectedCountries.length})`:""}</button>
        <button onClick={explain} style={S.btn}>🤖 AI Explain</button>
        <button onClick={exportPNG} style={S.btn}>⬇ Export PNG</button>
        <div style={S.chartTypeBtns}>
          {[["line","📈 Linie"],["area","🏔 Area"],["bar","📊 Bare"],["map","🗺 Harta"]].map(([type,label])=>(
            <button key={type} onClick={()=>setChartType(type)} style={{
              ...S.chartTypeBtn,
              background:chartType===type?"#6366F1":"#fff",
              color:chartType===type?"#fff":"#374151",
              borderColor:chartType===type?"#6366F1":"#D1D5DB",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={S.statsRow}>
        {[["Medie",stats.mean],["Maxim",stats.max],["Minim",stats.min]].map(([l,v])=>(
          <div key={l} style={S.statCard}>
            <span style={S.statLabel}>{l}</span>
            <span style={S.statValue}>{v!=null?Number(v).toFixed(2):"–"}</span>
          </div>
        ))}
        {selectedCountries.length>0&&(
          <div style={{...S.statCard,borderColor:"#C7D2FE",flex:"1 1 auto"}}>
            <span style={S.statLabel}>Tari selectate</span>
            <span style={{...S.statValue,fontSize:13}}>
              {selectedCountries.map(c=>geoLabels[c]||c).join(", ")}
            </span>
          </div>
        )}
      </div>

      <div style={S.mainLayout}>
        <div style={S.leftPanel}>
          {showCountryPanel&&availableCountries.length>0&&(
            <CountrySelector countries={availableCountries}
              selected={selectedCountries} onChange={setSelectedCountries}/>
          )}
          {loading&&<p style={{color:"#6B7280"}}>Se incarca datele...</p>}
          {!loading&&(
            chartType==="map" ? (
              <div ref={chartRef}>
                <EuropeMap geoLatestData={geoLatestData} geoLabels={geoLabels}/>
              </div>
            ) : chartData.length>0 ? (
              <div ref={chartRef}>
                <ResponsiveContainer width="100%" height={340}>
                  {renderChart()}
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{color:"#9CA3AF"}}>Nu exista date pentru aceasta selectie.</p>
            )
          )}
          {ai&&(
            <div style={S.aiExplainBox}>
              <h4 style={{margin:"0 0 8px",color:"#374151"}}>🤖 Analiza automata</h4>
              <p style={{margin:0,color:"#4B5563",lineHeight:1.6}}>{ai}</p>
            </div>
          )}
        </div>
        <div style={S.rightPanel}>
          <AiChat data={chartData} stats={stats}
            datasetLabel={selectedLabel}
            selectedCountries={selectedCountries.map(c=>geoLabels[c]||c)}
            countryData={countryData}
            datasetId={selected}/>
        </div>
      </div>
    </div>
  );
}

const S = {
  app:{paddingBottom:40,fontFamily:"'Segoe UI',system-ui,sans-serif",maxWidth:1400,margin:"0 auto",color:"#111827"},
  appHeader:{background:"linear-gradient(135deg,#1E3A5F 0%,#6366F1 100%)",padding:"24px 28px",borderRadius:"0 0 16px 16px",marginBottom:20},
  title:{fontSize:24,fontWeight:700,color:"#fff",margin:"0 0 4px"},
  subtitle:{color:"rgba(255,255,255,0.75)",fontSize:13},
  controls:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center",padding:"0 4px"},
  select:{padding:"8px 12px",borderRadius:8,border:"1px solid #D1D5DB",fontSize:14,cursor:"pointer",maxWidth:300},
  btn:{padding:"8px 14px",borderRadius:8,border:"1px solid #D1D5DB",background:"#fff",fontSize:14,cursor:"pointer",whiteSpace:"nowrap"},
  chartTypeBtns:{display:"flex",gap:4,marginLeft:4},
  chartTypeBtn:{padding:"7px 12px",borderRadius:8,border:"1px solid",fontSize:13,cursor:"pointer",transition:"all 0.15s"},
  statsRow:{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap",padding:"0 4px"},
  statCard:{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:10,padding:"10px 18px",display:"flex",flexDirection:"column",minWidth:100},
  statLabel:{fontSize:12,color:"#6B7280",marginBottom:2},
  statValue:{fontSize:20,fontWeight:600,color:"#6366F1"},
  mainLayout:{display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap",padding:"0 4px"},
  leftPanel:{flex:"1 1 480px",minWidth:320},
  rightPanel:{flex:"1 1 320px",minWidth:280},
  aiExplainBox:{marginTop:16,background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:10,padding:"14px 16px"},
  countrySelector:{border:"1px solid #E5E7EB",borderRadius:10,padding:12,marginBottom:16,background:"#FAFAFA"},
  countrySelectorHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  clearBtn:{fontSize:12,color:"#EF4444",background:"none",border:"none",cursor:"pointer"},
  searchInput:{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid #D1D5DB",fontSize:13,marginBottom:8,boxSizing:"border-box"},
  selectedTags:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8},
  tag:{color:"#fff",fontSize:12,padding:"2px 8px",borderRadius:12,display:"flex",alignItems:"center"},
  countryList:{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:2},
  countryItem:{display:"flex",alignItems:"center",padding:"4px 6px",borderRadius:6,cursor:"pointer",fontSize:13},
  chatContainer:{border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden",display:"flex",flexDirection:"column",background:"#fff",height:520},
  chatHeader:{background:"#6366F1",color:"#fff",padding:"12px 16px",fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:8,flexShrink:0},
  messagesArea:{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10},
  messageBubble:{maxWidth:"85%",padding:"10px 14px",borderRadius:16,fontSize:13,lineHeight:1.6,wordBreak:"break-word"},
  inputArea:{display:"flex",gap:8,padding:"10px 12px",borderTop:"1px solid #E5E7EB",background:"#F9FAFB",flexShrink:0},
  textarea:{flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid #D1D5DB",fontSize:13,resize:"none",outline:"none",fontFamily:"inherit"},
  sendBtn:{padding:"0 14px",background:"#6366F1",color:"#fff",border:"none",borderRadius:8,fontSize:16,cursor:"pointer",flexShrink:0},
  suggestionsArea:{display:"flex",gap:6,padding:"8px 12px",borderTop:"1px solid #E5E7EB",background:"#F9FAFB",flexWrap:"wrap",flexShrink:0},
  suggestionBtn:{padding:"4px 10px",borderRadius:20,border:"1px solid #C7D2FE",background:"#EEF2FF",color:"#4338CA",fontSize:11,cursor:"pointer"},
};
