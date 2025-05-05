
import streamlit as st
import pandas as pd
import yfinance as yf

st.set_page_config(page_title='Análise B3', layout='wide')
st.title("Agente Fundamentalista – Análise de Ações da B3")

# Carregar lista de ações
df_tickers = pd.read_csv("tickers_b3.csv")
tickers = df_tickers['Ticker'].tolist()

@st.cache_data
def coletar_dados(tickers):
    dados = []
    for ticker in tickers:
        try:
            info = yf.Ticker(ticker).info
            dados.append({
                'Ticker': ticker,
                'Nome': info.get('longName'),
                'Setor': info.get('sector'),
                'Preço Atual': info.get('currentPrice'),
                'P/L': info.get('trailingPE'),
                'ROE': info.get('returnOnEquity'),
                'Dividend Yield (%)': (info.get('dividendYield') or 0) * 100,
                'Dívida/Patrimônio': info.get('debtToEquity'),
                'Valor de Mercado (bi)': (info.get('marketCap') or 0) / 1e9
            })
        except:
            continue
    return pd.DataFrame(dados)

df = coletar_dados(tickers)

# Filtros do agente
filtros = (
    (df['ROE'] > 0.15) &
    (df['P/L'] < 12) &
    (df['Dividend Yield (%)'] > 5) &
    (df['Dívida/Patrimônio'] < 1.0)
)
df_filtrado = df[filtros].sort_values(by='ROE', ascending=False).reset_index(drop=True)

st.subheader("Ações que Passam nos Filtros de Valor")
st.dataframe(df_filtrado)



import pandas as pd
import yfinance as yf

def calcular_indicadores_tecnicos(ticker, dias=180):
    from datetime import datetime, timedelta
    fim = datetime.now()
    inicio = fim - timedelta(days=dias)

    try:
        df = yf.Ticker(ticker).history(start=inicio, end=fim)
        df['MM21'] = df['Close'].rolling(window=21).mean()
        df['MM50'] = df['Close'].rolling(window=50).mean()

        delta = df['Close'].diff()
        ganho = delta.clip(lower=0).rolling(14).mean()
        perda = -delta.clip(upper=0).rolling(14).mean()
        rs = ganho / perda
        df['RSI'] = 100 - (100 / (1 + rs))

        sinal_mm = df['MM21'].iloc[-1] > df['MM50'].iloc[-1]
        sinal_rsi = df['RSI'].iloc[-1] < 30
        sinal_compra = sinal_mm and sinal_rsi

        return {
            'Ticker': ticker,
            'MM21 > MM50': sinal_mm,
            'RSI < 30': sinal_rsi,
            'Sinal Técnico de Compra': sinal_compra
        }
    except:
        return {
            'Ticker': ticker,
            'MM21 > MM50': False,
            'RSI < 30': False,
            'Sinal Técnico de Compra': False
        }

def rodar_agente_tecnico(tickers):
    resultados = []
    for ticker in tickers:
        resultado = calcular_indicadores_tecnicos(ticker)
        resultados.append(resultado)
    return pd.DataFrame(resultados)



import requests
from bs4 import BeautifulSoup
from transformers import pipeline

# Carrega modelo de sentimento
sentimento_model = pipeline("sentiment-analysis")

def buscar_noticias(ticker):
    # Exemplo com InfoMoney e consulta simples
    url = f"https://www.infomoney.com.br/?s={ticker}"
    try:
        resposta = requests.get(url, timeout=10)
        soup = BeautifulSoup(resposta.text, "html.parser")
        titulos = [tag.text for tag in soup.find_all("h2")]
        return titulos[:5]  # retorna os 5 primeiros títulos encontrados
    except:
        return []

def analisar_sentimento_noticias(ticker):
    noticias = buscar_noticias(ticker)
    analises = []
    for texto in noticias:
        resultado = sentimento_model(texto)[0]
        analises.append({
            'Ticker': ticker,
            'Notícia': texto,
            'Sentimento': resultado['label'],
            'Confiança': resultado['score']
        })
    return analises



def avaliar_setores(df_fundamentalista):
    if 'Setor' not in df_fundamentalista.columns:
        return pd.DataFrame()
    
    setores = df_fundamentalista.groupby('Setor').agg({
        'ROE': 'mean',
        'P/L': 'mean',
        'Dividend Yield (%)': 'mean',
        'Dívida/Patrimônio': 'mean'
    }).reset_index()
    setores = setores.rename(columns={
        'ROE': 'ROE Médio',
        'P/L': 'P/L Médio',
        'Dividend Yield (%)': 'DY Médio',
        'Dívida/Patrimônio': 'Dívida/PL Médio'
    })
    return setores



def avaliar_risco_e_validacao(ticker):
    try:
        info = yf.Ticker(ticker).info
        liquidez_media = info.get('averageVolume')
        beta = info.get('beta')
        governance = info.get('corporateGovernance')

        return {
            'Ticker': ticker,
            'Liquidez Média': liquidez_media,
            'Beta (Volatilidade)': beta,
            'Governança': 'Sim' if governance else 'Não'
        }
    except:
        return {
            'Ticker': ticker,
            'Liquidez Média': None,
            'Beta (Volatilidade)': None,
            'Governança': 'Desconhecido'
        }

def rodar_agente_risco(tickers):
    resultados = []
    for ticker in tickers:
        resultados.append(avaliar_risco_e_validacao(ticker))
    return pd.DataFrame(resultados)



def gerar_score_oportunidade(df_fundamentalista, df_tecnico, df_risco):
    df = pd.merge(df_fundamentalista, df_tecnico, on='Ticker', how='inner')
    df = pd.merge(df, df_risco[['Ticker', 'Beta (Volatilidade)', 'Liquidez Média']], on='Ticker', how='left')

    # Normalizar e gerar score (exemplo simples com pesos)
    df['Score'] = (
        df['ROE'] * 100 +
        df['Dividend Yield (%)'] * 1.5 -
        df['P/L'] * 1.0 -
        df['Dívida/Patrimônio'] * 10 +
        df['Sinal Técnico de Compra'].astype(int) * 25 -
        (df['Beta (Volatilidade)'].fillna(1) * 5)
    )
    df = df.sort_values(by='Score', ascending=False).reset_index(drop=True)
    return df[['Ticker', 'Score'] + [col for col in df.columns if col not in ['Score', 'Ticker']]]



import streamlit as st
from pdf.gerador_pdf import gerar_relatorio_pdf

st.subheader("Executar Todos os Agentes")

if st.button("Rodar Sistema Completo"):
    # Etapas simuladas de execução
    with st.spinner("Coletando dados e executando agentes..."):
        df_fund = coletar_dados(tickers)
        df_tec = rodar_agente_tecnico(tickers)
        df_risco = rodar_agente_risco(tickers)
        df_score = gerar_score_oportunidade(df_fund, df_tec, df_risco)
    
    st.success("Análise concluída!")

    st.subheader("Ranking Final de Oportunidades")
    st.dataframe(df_score)

    if st.button("Gerar Relatório PDF"):
        caminho_pdf = gerar_relatorio_pdf(df_score)
        with open(caminho_pdf, "rb") as f:
            st.download_button("Clique aqui para baixar o PDF", f, file_name="relatorio_b3.pdf")
