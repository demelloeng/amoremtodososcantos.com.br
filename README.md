# amoremtodososcantos.com.br

Site V0 (substituto do Linktree) de **Amor em todos os cantos — Fissura**, de Marcos de Mello Silva.

Página única, estática (HTML, CSS e JavaScript sem framework), com compra direta e cards de compra em outras lojas.

## Estrutura

```
/
├── index.html
├── privacidade.html
├── styles.css
├── assets/        (imagens, analytics.js, direct-sales.js)
├── config/        (prices.json: preços, pagamento e regras de frete)
├── tests/         (node --test tests/*.test.js)
├── CNAME          (amoremtodososcantos.com.br)
└── README.md
```

## Publicação (GitHub Pages)

1. Criar o repositório `demelloeng/amoremtodososcantos.com.br` no GitHub.
2. Enviar este conteúdo para a branch `main`.
3. Em Settings → Pages, selecionar a branch `main` (pasta raiz) como fonte.
4. O arquivo `CNAME` já está configurado com `amoremtodososcantos.com.br` como domínio customizado.
5. Configurar o DNS no Registro.br conforme instruções do relatório de entrega.

## Preços

Os preços exibidos vêm de `config/prices.json` (fonte única no site). O preço anterior da compra direta
(`reference_amount_cents`) e o desconto "R$ X OFF" são calculados a partir dele, arredondando o desconto para baixo.
Não escreva valores de preço em outros arquivos.

## Como ler as métricas (Simple Analytics)

Cada evento é uma contagem independente: o Simple Analytics não monta funil nem identifica visitantes.
Eventos da mesma carga de página compartilham um `page_load_id`; uma nova carga (por exemplo, o retorno do
checkout, que abre em outra janela) não se liga à anterior.

| Evento | Significa |
|---|---|
| `click_compre_aqui`, `click_conheca_fic` | Cliques nos botões do topo (`placement=hero`). Os demais "COMPRE AQUI" não são medidos. |
| `click_amazon`, `click_uiclap`, `click_clube_autores` | Cliques nos cards de outras lojas |
| `view_item` | A oferta direta entrou na tela, com ou sem clique em CTA antes |
| `add_shipping_info` | Frete calculado (repete a cada cálculo) |
| `begin_checkout` | Clique em Comprar (repete em nova tentativa) |
| `direct_checkout_created` | Checkout criado |
| `direct_checkout_return` | Retorno com `order_id` na URL; não confirma pagamento |
| `direct_payment_confirmed` | A API confirmou `PAID` na mesma aba que criou o pedido. Subconta: quem pagou e voltou em outra janela não aparece. Para vendas, use o painel do Asaas. |

Pageviews não contam âncoras (`#comprar`) e visitantes com Do Not Track ou bloqueador de anúncios não aparecem.

