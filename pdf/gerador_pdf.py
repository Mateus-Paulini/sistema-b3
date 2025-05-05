
from fpdf import FPDF
import os

def gerar_relatorio_pdf(df, caminho='relatorio_oportunidades.pdf'):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Arial", size=12)

    pdf.cell(200, 10, txt="Relatório de Oportunidades de Ações - B3", ln=True, align="C")

    for i, row in df.iterrows():
        pdf.ln(10)
        pdf.set_font("Arial", "B", 12)
        pdf.cell(200, 10, txt=f"{row['Ticker']} – Score: {round(row['Score'], 2)}", ln=True)

        pdf.set_font("Arial", size=11)
        for col in df.columns:
            if col != "Ticker" and col != "Score":
                valor = row[col]
                if isinstance(valor, float):
                    valor = round(valor, 2)
                pdf.cell(200, 8, txt=f"{col}: {valor}", ln=True)

    pdf.output(caminho)
    return caminho
