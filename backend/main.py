from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests
import pandas as pd
from openai import OpenAI
import os

app = FastAPI(title="Eurostat Universal Explorer API", version="1.0.0")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Originile permise pentru CORS. In productie se seteaza variabila de mediu
# ALLOWED_ORIGINS (lista separata prin virgula, ex: https://app.vercel.app).
# Daca nu e setata, permitem orice origine (util in dezvoltare).
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    """Endpoint de verificare — confirma ca serverul ruleaza."""
    return {"status": "ok", "service": "Eurostat Universal Explorer API"}

@app.get("/datasets")
def datasets():
    return {
        "categories": [
            {
                "label": "Populatie",
                "datasets": [
                    {"id": "demo_gind",    "label": "Indicatori demografici generali"},
                    {"id": "demo_pjan",    "label": "Populatie la 1 ianuarie"},
                    {"id": "demo_mlexpec", "label": "Speranta de viata"},
                    {"id": "demo_gfrate",  "label": "Rata fertilitatii"},
                    {"id": "demo_minfind", "label": "Mortalitate infantila"},
                    {"id": "tps00001",     "label": "Structura populatiei pe varste"},
                ]
            },
            {
                "label": "Economie & PIB",
                "datasets": [
                    {"id": "nama_10_gdp", "label": "PIB (GDP) - total"},
                    {"id": "nama_10_pc",  "label": "PIB pe locuitor"},
                    {"id": "tec00001",    "label": "Rata de crestere PIB"},
                    {"id": "tec00115",    "label": "Datoria publica (% PIB)"},
                    {"id": "tec00127",    "label": "Deficitul bugetar (% PIB)"},
                ]
            },
            {
                "label": "Piata muncii",
                "datasets": [
                    {"id": "une_rt_a",     "label": "Rata somajului (anual)"},
                    {"id": "une_rt_m",     "label": "Rata somajului (lunar)"},
                    {"id": "yth_empl_010", "label": "Somaj tineri"},
                    {"id": "lfsa_ergan",   "label": "Rata de ocupare pe gen"},
                    {"id": "earn_nt_net",  "label": "Salariul mediu net"},
                ]
            },
            {
                "label": "Preturi & Inflatie",
                "datasets": [
                    {"id": "prc_hicp_aind", "label": "Inflatie (HICP) - anual"},
                    {"id": "prc_hicp_midx", "label": "Indice preturi consum"},
                    {"id": "prc_hpi_a",     "label": "Indice preturi locuinte"},
                ]
            },
            {
                "label": "Sanatate",
                "datasets": [
                    {"id": "hlth_cd_acdr2", "label": "Cauze de deces"},
                    {"id": "hlth_rs_beds",  "label": "Paturi de spital"},
                    {"id": "hlth_rs_phys",  "label": "Numar medici"},
                ]
            },
            {
                "label": "Educatie",
                "datasets": [
                    {"id": "edat_lfse_03",    "label": "Abandon scolar timpuriu"},
                    {"id": "educ_uoe_grad02", "label": "Absolventi invatamant superior"},
                    {"id": "tps00065",        "label": "Cheltuieli publice pentru educatie"},
                ]
            },
            {
                "label": "Mediu & Energie",
                "datasets": [
                    {"id": "env_air_emis",  "label": "Emisii de CO2"},
                    {"id": "nrg_ind_share", "label": "Energie din surse regenerabile"},
                    {"id": "nrg_bal_s",     "label": "Balanta energetica"},
                ]
            },
            {
                "label": "Conditii de viata",
                "datasets": [
                    {"id": "ilc_di12",   "label": "Inegalitate venituri (Gini)"},
                    {"id": "ilc_li01",   "label": "Risc de saracie"},
                    {"id": "ilc_hcmh01", "label": "Costul locuintei"},
                ]
            },
            {
                "label": "Digital & Inovatie",
                "datasets": [
                    {"id": "isoc_r_broad_h", "label": "Acces internet broadband"},
                    {"id": "isoc_ci_in_h",   "label": "Utilizare internet"},
                    {"id": "rd_e_gerdtot",   "label": "Cheltuieli cercetare-dezvoltare"},
                ]
            },
        ]
    }


def parse_eurostat(dataset: str):
    url = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}"
    res = requests.get(url)
    if res.status_code != 200:
        return None, {}

    data = res.json()
    values = data.get("value", {})
    dims = data.get("dimension", {})
    dim_order = data.get("id", [])

    dim_categories = {}
    for dim in dim_order:
        dim_categories[dim] = list(dims[dim]["category"]["index"].keys())

    geo_labels = {}
    if "geo" in dims:
        cat = dims["geo"]["category"]
        idx = cat.get("index", {})
        labels = cat.get("label", {})
        for code in idx.keys():
            geo_labels[code] = labels.get(code, code)

    rows = []
    for key, val in values.items():
        try:
            key = int(key)
            coords = []
            temp = key
            for dim in reversed(dim_order):
                size = len(dim_categories[dim])
                coords.insert(0, temp % size)
                temp = temp // size
            record = {}
            for i, dim in enumerate(dim_order):
                record[dim] = dim_categories[dim][coords[i]]
            record["value"] = float(val)
            rows.append(record)
        except:
            continue

    df = pd.DataFrame(rows)
    return df, geo_labels


@app.get("/eurostat")
def eurostat(dataset: str = "demo_gind", countries: str = ""):
    print("DATASET:", dataset, "| COUNTRIES:", countries)

    df, geo_labels = parse_eurostat(dataset)

    if df is None or df.empty:
        return {"data": [], "stats": {}, "countries": [], "country_data": {}}

    if "time" in df.columns:
        df = df.sort_values("time")

    available_countries = []
    if "geo" in df.columns:
        codes = df["geo"].unique().tolist()
        available_countries = sorted([
            {"code": c, "label": geo_labels.get(c, c)}
            for c in codes
        ], key=lambda x: x["label"])

    selected = [c.strip() for c in countries.split(",") if c.strip()] if countries else []

    if selected and "geo" in df.columns:
        df_filtered = df[df["geo"].isin(selected)]
    else:
        df_filtered = df

    country_data = {}
    if "geo" in df_filtered.columns and "time" in df_filtered.columns:
        # Intotdeauna construim country_data pentru toate tarile disponibile
        # (limitat la 40 tari pentru performanta)
        target_countries = selected if selected else df_filtered["geo"].unique().tolist()[:40]
        for cc in target_countries:
            df_c = df_filtered[df_filtered["geo"] == cc]
            df_c_agg = df_c.groupby("time")["value"].mean().reset_index()
            df_c_agg = df_c_agg.rename(columns={"time": "year"})
            country_data[cc] = df_c_agg.head(100).to_dict(orient="records")

    # ===== FILTRARE INTELIGENTA dimensiuni comune =====
    print(f"INAINTE FILTRARE: shape={df_filtered.shape}, cols={list(df_filtered.columns)}")

    # sex: preferam "T" (total)
    if "sex" in df_filtered.columns:
        if "T" in df_filtered["sex"].values:
            df_filtered = df_filtered[df_filtered["sex"] == "T"]
            print("sex -> T")

    # age: TOTAL intai (populatie totala), apoi Y1 (nastere pentru speranta de viata)
    if "age" in df_filtered.columns:
        age_vals = sorted(df_filtered["age"].unique().tolist())
        print(f"age disponibile ({len(age_vals)}): {age_vals[:10]}")
        # TOTAL = suma tuturor varstelor (corect pentru populatie, ocupare etc)
        # Y1 = la nastere (corect pentru speranta de viata)
        preferred_ages = ["TOTAL", "Y1", "Y_LT1", "Y_GE0", "Y_LT5"]
        chose = None
        for pref in preferred_ages:
            if pref in age_vals:
                chose = pref
                break
        if chose:
            df_filtered = df_filtered[df_filtered["age"] == chose]
            print(f"age filtrat -> {chose}, randuri ramase: {len(df_filtered)}")
        else:
            print(f"ATENTIE: niciun age preferat, disponibile: {age_vals}")

    # unit: NR (numar persoane) > YR (ani) > PC (procente)
    if "unit" in df_filtered.columns:
        unit_vals = df_filtered["unit"].unique().tolist()
        print(f"unit disponibile: {unit_vals}")
        preferred_units = ["NR", "THS", "YR", "PC", "PC_ACT", "EUR_HAB", "PPS_HAB"]
        chose_u = None
        for pref in preferred_units:
            if pref in unit_vals:
                chose_u = pref
                break
        if chose_u:
            df_filtered = df_filtered[df_filtered["unit"] == chose_u]
            print(f"unit filtrat -> {chose_u}, randuri ramase: {len(df_filtered)}")

    # indic_de: preferam GIND
    if "indic_de" in df_filtered.columns:
        indic_vals = df_filtered["indic_de"].unique().tolist()
        if "GIND" in indic_vals:
            df_filtered = df_filtered[df_filtered["indic_de"] == "GIND"]

    # Verificare sample RO
    if "geo" in df_filtered.columns:
        ro = df_filtered[df_filtered["geo"]=="RO"].sort_values("time",ascending=False).head(3)
        if not ro.empty:
            print(f"Sample RO dupa filtrare: {ro[['time','value']].values.tolist()}")

    # Daca dupa filtrare nu mai avem date, folosim originalul
    if df_filtered.empty:
        print("ATENTIE: df_filtered gol dupa filtrare, revert la original")
        df_filtered = df

    group_col = "time" if "time" in df_filtered.columns else df_filtered.columns[0]
    df_chart = df_filtered.groupby(group_col)["value"].mean().reset_index()
    df_chart = df_chart.rename(columns={group_col: "year"})

    # Recalculam country_data dupa filtrare
    country_data = {}
    if "geo" in df_filtered.columns and "time" in df_filtered.columns:
        target_countries = selected if selected else df_filtered["geo"].unique().tolist()
        for cc in target_countries:
            df_c = df_filtered[df_filtered["geo"] == cc]
            df_c_agg = df_c.groupby("time")["value"].mean().reset_index()
            df_c_agg = df_c_agg.rename(columns={"time": "year"})
            country_data[cc] = df_c_agg.head(100).to_dict(orient="records")

    return {
        "data": df_chart.head(200).to_dict(orient="records"),
        "country_data": country_data,
        "countries": available_countries,
        "geo_labels": geo_labels,
        "stats": {
            "mean": float(df_filtered["value"].mean()),
            "max": float(df_filtered["value"].max()),
            "min": float(df_filtered["value"].min())
        }
    }


@app.post("/ai-explain")
def ai_explain(payload: dict):
    data = payload.get("data", [])
    dataset_label = payload.get("dataset_label", "dataset")
    selected_countries = payload.get("selected_countries", [])

    if not data:
        return {"explanation": "Nu exista date."}

    df = pd.DataFrame(data)
    # Sortam descendent dupa an si luam cele mai recente 20 randuri
    if "year" in df.columns:
        df = df.sort_values("year", ascending=False)
    sample = df.head(20).to_string()
    tari_str = ", ".join(selected_countries) if selected_countries else "toate tarile"

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": (
                f"Esti un analist de date Eurostat. Analizeaza datele pentru '{dataset_label}' ({tari_str}):\n\n"
                f"{sample}\n\n"
                "Ofera o analiza concisa in romana: tendinte principale, valori remarcabile si posibile explicatii."
            )
        }]
    )
    return {"explanation": response.choices[0].message.content}


@app.post("/ai-chat")
def ai_chat(payload: dict):
    messages = payload.get("messages", [])
    data = payload.get("data", [])
    stats = payload.get("stats", {})
    dataset_label = payload.get("dataset_label", "dataset")
    selected_countries = payload.get("selected_countries", [])
    dataset_id = payload.get("dataset_id", "")

    if not messages:
        return {"reply": "Nu am primit niciun mesaj."}

    df = pd.DataFrame(data) if data else pd.DataFrame()
    if not df.empty and "year" in df.columns:
        df = df.sort_values("year", ascending=False)

    # Construim tabel per tara direct din Eurostat daca avem dataset_id
    country_data_payload = {}
    if dataset_id:
        try:
            df_full, geo_lbl = parse_eurostat(dataset_id)
            if df_full is not None and not df_full.empty:
                # Aplicam filtrele de dimensiuni
                if "sex" in df_full.columns and "T" in df_full["sex"].values:
                    df_full = df_full[df_full["sex"] == "T"]
                if "age" in df_full.columns:
                    for pref in ["TOTAL","Y1","Y_LT1"]:
                        if pref in df_full["age"].values:
                            df_full = df_full[df_full["age"] == pref]
                            break
                if "unit" in df_full.columns:
                    for pref in ["YR","PC","PC_ACT","EUR_HAB","PPS_HAB","NR"]:
                        if pref in df_full["unit"].values:
                            df_full = df_full[df_full["unit"] == pref]
                            break
                if "geo" in df_full.columns and "time" in df_full.columns:
                    for cc in df_full["geo"].unique()[:30]:
                        df_c = df_full[df_full["geo"] == cc].groupby("time")["value"].mean().reset_index()
                        country_data_payload[cc] = [{"year": r["time"], "value": r["value"]} for _, r in df_c.iterrows()]
        except Exception as e:
            print("AI chat Eurostat fetch error:", e)

    # Construim tabel structurat per tara din country_data
    # Folosim country_data_payload daca exista, altfel construim din data agregata
    source_data = country_data_payload if country_data_payload else {}

    if source_data:
        lines = []
        all_years = set()
        country_series = {}

        country_codes = list(source_data.keys())
        # Luam maxim 10 tari pentru a nu depasi limita de tokeni
        for code in country_codes[:10]:
            # Labelul: din selected_countries daca e acolo, altfel codul
            if code in (selected_countries or []):
                label = code
            else:
                label = code
            sorted_rows = sorted(source_data[code], key=lambda x: x.get("year",""), reverse=True)
            recent_rows = sorted_rows[:12]
            country_series[label] = {r["year"]: r["value"] for r in recent_rows}
            for r in recent_rows:
                all_years.add(r["year"])

        if country_series:
            years_sorted = sorted(all_years, reverse=True)[:12]
            col_w = 10
            header = f"{'An':6} | " + " | ".join(f"{c[:col_w]:{col_w}}" for c in country_series.keys())
            lines.append(header)
            lines.append("-" * len(header))
            for yr in years_sorted:
                row_vals = []
                for c_label, series in country_series.items():
                    val = series.get(yr)
                    row_vals.append(f"{val:{col_w}.2f}" if val is not None else f"{'N/A':>{col_w}}")
                lines.append(f"{yr:6} | " + " | ".join(row_vals))
            data_summary = "\n".join(lines)
        else:
            data_summary = df.to_string() if not df.empty else "Nu exista date."
    else:
        if not df.empty and len(df) > 25:
            recent = df.head(20)
            historic = df.tail(5)
            df_summary = pd.concat([recent, historic])
        else:
            df_summary = df
        data_summary = df_summary.to_string() if not df.empty else "Nu exista date disponibile."
    tari_str = ", ".join(selected_countries) if selected_countries else "toate tarile"

    system_prompt = (
        f"Esti un asistent specializat in analiza datelor statistice Eurostat. "
        f"Utilizatorul vizualizeaza dataset-ul '{dataset_label}' pentru: {tari_str}.\n\n"
        f"Date disponibile:\n{data_summary}\n\n"
        f"Statistici: Medie={stats.get('mean', 0):.2f}, "
        f"Max={stats.get('max', 0):.2f}, "
        f"Min={stats.get('min', 0):.2f}\n\n"
        f"Raspunde in romana, concis si relevant."
    ) if not df.empty else "Esti un asistent pentru analiza datelor Eurostat. Raspunde in romana."

    # Debug: afisam primele 500 chars din data_summary in log
    print("=== AI CHAT DATA SUMMARY (first 500 chars) ===")
    print(data_summary[:500] if data_summary else "EMPTY")
    print("=== country_data_payload keys:", list(country_data_payload.keys())[:10])
    print("=== dataset_id:", dataset_id)
    print("===============================================")

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            *messages
        ]
    )
    return {"reply": response.choices[0].message.content}
