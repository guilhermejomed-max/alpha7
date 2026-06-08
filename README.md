# Robo Binance Futures: rompimento de canal

Este projeto roda uma estrategia simples para futuros USDT-M da Binance:

1. Busca candles fechados do simbolo configurado.
2. Monta automaticamente um canal lateral ou levemente baixista.
3. Confirma rompimento para baixo quando o fechamento sai abaixo da linha inferior.
4. Para venda, projeta o alvo para baixo usando a altura do canal.
5. Coloca stop loss se o preco voltar para dentro do canal.

Por seguranca, o projeto vem com `DRY_RUN=true`, `DEMO_ONLY=true` e `BINANCE_TESTNET=true`.

## Como rodar localmente

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -m bot.runner
```

No PowerShell, carregue as variaveis do `.env` ou configure-as manualmente:

```powershell
$env:DRY_RUN="true"
$env:BINANCE_TESTNET="true"
$env:SYMBOL="BTCUSDT"
python -m bot.runner
```

## Como subir no GitHub

1. Crie um repositorio no GitHub.
2. Envie estes arquivos.
3. Em `Settings > Secrets and variables > Actions > Secrets`, crie:
   - `BINANCE_API_KEY`
   - `BINANCE_API_SECRET`
4. Em `Settings > Secrets and variables > Actions > Variables`, configure:
   - `DRY_RUN=true`
   - `DEMO_ONLY=true`
   - `BINANCE_TESTNET=true`
   - `SYMBOL=BTCUSDT`
   - `INTERVAL=1m`

O workflow `.github/workflows/run-bot.yml` roda manualmente e tambem tenta executar a cada 5 minutos.

## Aviso importante sobre GitHub Actions

GitHub Actions nao e um servidor 24h de baixa latencia. O agendamento pode atrasar e o job pode falhar ou ser interrompido. Use o GitHub para testar, simular e rodar checagens lentas. Para operar dinheiro real, prefira uma VPS com processo continuo e monitoramento.

## Variaveis principais

| Variavel | Padrao | Uso |
| --- | --- | --- |
| `DRY_RUN` | `true` | Mostra o plano de ordens sem enviar para a Binance. |
| `DEMO_ONLY` | `true` | Impede execucao contra mercado real enquanto estiver em fase de teste. |
| `BINANCE_TESTNET` | `true` | Usa o ambiente de teste de futuros. |
| `SYMBOL` | `BTCUSDT` | Par de futuros USDT-M. |
| `INTERVAL` | `1m` | Timeframe dos candles. |
| `CHANNEL_CANDLES` | `40` | Quantidade de candles usados para desenhar o canal. |
| `BREAKOUT_BUFFER_PCT` | `0.001` | Distancia minima abaixo da linha inferior para confirmar rompimento. |
| `TAKE_PROFIT_MULTIPLIER` | `1.0` | Multiplicador da altura do canal para projetar o alvo. |
| `STOP_RETURN_BUFFER_PCT` | `0.0005` | Pequena folga acima da linha inferior para o stop. |
| `POSITION_NOTIONAL_USDT` | `20` | Tamanho da entrada em USDT nocional. |
| `MAX_POSITION_NOTIONAL_USDT` | `50` | Teto absoluto de tamanho da entrada. |

## Logica do canal

A estrategia usa regressao linear dos fechamentos dos candles do canal e mede os extremos dos pavios acima e abaixo dessa linha. Assim ela aceita canal horizontal ou inclinado para baixo, parecido com o exemplo do TradingView.

Para short:

```text
linha superior = regressao + maior desvio dos highs
linha inferior = regressao + menor desvio dos lows
altura = linha superior - linha inferior
entrada = fechamento abaixo da linha inferior com buffer
take profit = linha inferior - altura
stop loss = linha inferior + buffer de retorno
```

## Antes de sair do modo teste

- Valide em Binance Futures Testnet.
- Troque `DRY_RUN=false` apenas quando quiser enviar ordens na conta demo.
- Mantenha `DEMO_ONLY=true` durante toda a fase de conta demo.
- Comece com valor baixo.
- Confirme se o simbolo tem liquidez.
- Use chave de API com permissao minima.
- Nao coloque chave real em arquivo `.env` dentro do Git.
