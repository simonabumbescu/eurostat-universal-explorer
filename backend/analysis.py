import pandas as pd
import numpy as np

def analyze_data(df: pd.DataFrame):
    insights = []
    
    # curățare date
    df = df.dropna()

    # detectare coloane
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(include='object').columns.tolist()

    # =========================
    # 1. STATISTICI DE BAZĂ
    # =========================
    stats = {}

    for col in numeric_cols:
        stats[col] = {
            "mean": round(df[col].mean(), 2),
            "median": round(df[col].median(), 2),
            "min": float(df[col].min()),
            "max": float(df[col].max()),
            "std": round(df[col].std(), 2)
        }

    # =========================
    # 2. DETECTARE TREND (simplu)
    # =========================
    trends = []

    for col in numeric_cols:
        if len(df[col]) > 1:
            if df[col].iloc[-1] > df[col].iloc[0]:
                trends.append(f"{col} shows an increasing trend")
            elif df[col].iloc[-1] < df[col].iloc[0]:
                trends.append(f"{col} shows a decreasing trend")

    # =========================
    # 3. DETECTARE OUTLIERS
    # =========================
    outliers = {}

    for col in numeric_cols:
        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)
        iqr = q3 - q1

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        outlier_values = df[(df[col] < lower) | (df[col] > upper)][col]

        if not outlier_values.empty:
            outliers[col] = outlier_values.tolist()

    # =========================
    # 4. CORELATII
    # =========================
    correlations = {}

    if len(numeric_cols) >= 2:
        corr_matrix = df[numeric_cols].corr()

        for col1 in numeric_cols:
            for col2 in numeric_cols:
                if col1 != col2:
                    corr_value = corr_matrix.loc[col1, col2]

                    if abs(corr_value) > 0.7:
                        correlations[f"{col1}-{col2}"] = round(corr_value, 2)

    # =========================
    # 5. SUGESTIE GRAFIC
    # =========================
    if len(numeric_cols) >= 2:
        suggested_chart = "scatter"
    elif len(numeric_cols) == 1 and len(categorical_cols) >= 1:
        suggested_chart = "bar"
    else:
        suggested_chart = "line"

    # =========================
    # 6. INSIGHT TEXT (pentru AI)
    # =========================
    insight_text = {
        "stats": stats,
        "trends": trends,
        "outliers": outliers,
        "correlations": correlations
    }

    # =========================
    # OUTPUT FINAL
    # =========================
    return {
        "columns": df.columns.tolist(),
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "stats": stats,
        "trends": trends,
        "outliers": outliers,
        "correlations": correlations,
        "suggested_chart": suggested_chart,
        "insight_text": insight_text,
        "data": df.head(100).to_dict(orient="records")
    }