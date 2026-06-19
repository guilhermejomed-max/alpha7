# MEXC Signal Radar

Aplicativo de sinais para mercados futuros da MEXC. Ele não acessa conta, não
consulta saldo, não possui chave secreta e nunca envia ordens.

Os dados de ticker e candles vêm dos endpoints públicos da MEXC, que não exigem
login nem API key.

## Sinal de entrada

Uma entrada só é marcada como confirmada quando todos os filtros estão alinhados:

- ADX acima de 25.
- Preço e inclinação alinhados à EMA200.
- RSI cruzando 30 para compra ou 70 para venda.
- Bandas de Bollinger em expansão.
- Volume atual acima da média de 20 candles.
- Ativo entre os melhores do ranking de força relativa.
- BTC no mesmo regime.
- Tendência confirmada no timeframe superior.
- Liquidez, spread, volatilidade e horário aceitáveis.
- Nenhuma janela manual de notícia bloqueando a entrada.

Quando o sinal aparece, o painel mostra:

- Compra ou venda.
- Preço de entrada observado.
- Stop inicial baseado em ATR.
- Alvo de +1R.
- Alvo de +2R.
- ADX, RSI, ATR, volume e qualidade do sinal.

O painel também explica quais filtros ainda bloqueiam cada ativo.

O radar usa três estados:

- **Confirmado:** todos os critérios passaram; entrada, stop e alvos são exibidos.
- **Armado:** toda a estrutura passou e falta somente o cruzamento do RSI.
- **Em observação:** o ativo tem bom alinhamento, mas ainda possui dois ou mais bloqueios.

Os cálculos usam apenas candles fechados. Isso evita que o volume parcial do
candle em formação bloqueie artificialmente os sinais.

## Rodar

Requer Node.js 20 ou superior:

```powershell
Copy-Item .env.example .env
npm test
npm start
```

Abra:

```text
http://localhost:8787
```

Não existe chave para preencher.

## Configuração

As regras ficam no `.env`:

```env
WATCHLIST=BTC_USDT,ETH_USDT,SOL_USDT
TIMEFRAME=Min15
HIGHER_TIMEFRAME=Hour4
ADX_MIN=25
ATR_STOP_MULTIPLIER=2
RELATIVE_STRENGTH_TOP_N=5
SCAN_INTERVAL_MS=300000
SCAN_COOLDOWN_MS=30000
```

O cooldown evita que várias abas abertas façam leituras repetidas e atinjam o
limite público da MEXC. Se a corretora limitar temporariamente as consultas, o
painel preserva a última leitura válida.

Janelas de notícias podem ser inseridas manualmente, sem serviço externo:

```env
NEWS_BLACKOUTS_JSON=[{"title":"FOMC","start":"2026-06-19T17:45:00Z","end":"2026-06-19T19:30:00Z"}]
```

Sem um calendário integrado, o painel lembra que notícias devem ser confirmadas
manualmente antes de executar o sinal.

## Publicar

O projeto precisa de um ambiente Node.js porque o navegador não deve chamar a
MEXC diretamente em todas as instalações. Pode ser hospedado em Render, Railway,
Fly.io, Cloud Run ou outro serviço Node.

GitHub Pages sozinho hospeda apenas arquivos estáticos e não executa o scanner.

```bash
git init
git add .
git commit -m "feat: MEXC signal radar"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## Estrutura

```text
index.html                página principal na raiz
styles.css                layout responsivo
app.js                    interface e renderização dos sinais
server/index.mjs          servidor
server/lib/scanner.mjs    leitura e ranking dos mercados
server/lib/strategy.mjs   regras dos sinais
server/lib/indicators.mjs indicadores técnicos
server/lib/mexc.mjs       somente endpoints públicos
test/                     testes
```

Este software é informativo e experimental. Um sinal técnico não garante
resultado e não substitui avaliação de risco.
