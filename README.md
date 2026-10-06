# Extensão Doida — Automação Instagram (Firefox)

Extensão experimental do Firefox que automatiza **curtidas** e **comentários** no
Instagram, com limites e delays aleatórios para reduzir o risco de detecção.

> ⚠️ **AVISO IMPORTANTE — leia antes de usar**
>
> 1. **Viola os Termos de Uso do Instagram/Meta.** Automação de curtidas e
>    comentários é explicitamente proibida.
> 2. **Risco de banimento.** O Instagram detecta comportamento automatizado.
>    Você pode sofrer bloqueio temporário, *shadowban* ou banimento definitivo.
> 3. **Não vai para a AMO.** A Mozilla não aceita extensões que automatizam
>    plataformas de terceiros. Instale apenas via "modo desenvolvedor"
>    (`about:debugging`) ou distribua por fora.
>
> Use por sua conta e risco, de preferência numa conta descartável. Este projeto
> tem finalidade **educacional**.

---

## Funcionalidades

- Curtir o post visível (busca via `aria-label`, funciona em PT/EN/ES).
- Comentar usando o *native setter* do textarea (necessário porque o Instagram
  usa React) e publicar pelo botão "Publicar/Post" (sem depender de `<form>`).
- **Três modos de operação**: página atual, feed (scrollar) e lista de posts.
- **Scroll do feed**: rola a home/explorar, curte os posts que aparecem e, com
  comentário habilitado, também abre o post para comentar.
- **Lista de posts**: cola uma lista de URLs; a extensão abre cada um, curte/comenta
  e passa ao próximo.
- Painel (popup) com configuração completa.
- Limites: curtidas/hora, curtidas/dia e comentários/dia.
- Delays aleatórios entre ações e contadores que zeram ao virar dia/hora.

## Estrutura

```
manifest.json                 # MV3 (Firefox usa background "scripts", não service worker)
common/config.js              # API compat + defaults + helpers de storage
background/background.js      # agendamento (alarms), limites, despacho
content/content.js            # interações no DOM (curtir/comentar)
popup/popup.html|css|js       # painel de configuração
icons/                        # ícones
```

## Executando o projeto (desenvolvimento)

### Pré-requisitos

- **Node.js 18+** e **npm**
- **Firefox 109+** (para Manifest V3)

### Instalar dependências

```bash
npm install
```

Baixa o `web-ext` (ferramenta oficial da Mozilla para desenvolver extensões).

### Rodar no Firefox (modo desenvolvedor)

```bash
npm run run
```

- Abre o Firefox com a extensão carregada como **extensão temporária**.
- Recarrega a extensão **automaticamente** sempre que você edita qualquer arquivo.
- Para parar, feche o Firefox (ou `Ctrl+C` no terminal que rodou o comando).

> Equivale a `npx web-ext run --firefox=/usr/bin/firefox --start-url https://www.instagram.com/`.

### Validar o manifesto/código

```bash
npm run lint
```

### Empacotar (.xpi)

```bash
npm run build
```

Gera o pacote em `web-ext-artifacts/` (não assinado). Para publicar/assinar use
`npx web-ext sign --api-key ... --api-secret ...`.

### Instalação manual (sem terminal)

Veja a seção [Instalação (Firefox)](#instalação-firefox) abaixo.

## Instalação (Firefox)

1. Abra o Firefox e acesse `about:debugging#/runtime/this-firefox`.
2. Clique em **"Carregar Extensão Temporária"** (*Load Temporary Add-on*).
3. Selecione o arquivo `manifest.json` desta pasta.
4. **Recarregue as abas do Instagram** que já estiverem abertas (o content script
   só é injetado em abas carregadas depois da instalação).
5. Clique no ícone da extensão na barra de ferramentas para abrir o painel.

> Extensões temporárias são removidas ao fechar o Firefox. Para algo permanente,
> empacote como `.xpi` (ou `web-ext sign`) e instale via `about:addons`.

## Instalar a extensão (para outras pessoas)

⚠️ A extensão **não é assinada** pela Mozilla. O Firefox comum só instala
extensões **assinadas** de forma permanente. Quem for instalar tem 3 caminhos:

### A) Modo temporário (Firefox comum — mais simples, mas some ao fechar)

1. Baixe o `.xpi`/`.zip` (ou clone o repositório).
2. Abra `about:debugging#/runtime/this-firefox`.
3. Clique em **"Carregar Extensão Temporária"** e selecione o `.xpi`/`.zip`
   (ou o `manifest.json` da pasta).
4. Abra/recarregue o Instagram e use.

### B) Instalação permanente (Firefox Developer Edition ou Nightly)

1. Instale o [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
   (ou Nightly).
2. Abra `about:config`, aceite o aviso e defina:
   `xpinstall.signatures.required` → **false**
3. Abra `about:addons` → ⚙️ → **"Instalar complemento a partir de arquivo"**
   e selecione o `.xpi`.
4. Pronto: fica instalada mesmo depois de fechar o navegador.

### C) Assinatura pela Mozilla (instala permanente no Firefox comum)

Crie credenciais em https://addons.mozilla.org/developers/ e rode:

```bash
npx web-ext sign --api-key SEU_API_KEY --api-secret SEU_API_SECRET
```

Isso gera um `.xpi` **assinado**, instalável permanentemente no Firefox normal.
**Atenção:** a Mozilla pode recusar a assinatura porque a extensão automatiza o
Instagram (política de plataformas de terceiros).

### Onde baixar o `.xpi`

Rode `npm run build` (gera em `web-ext-artifacts/`) e anexe o `.xpi` a um
**Release** do GitHub para facilitar o download.

## Como usar

1. Abra o Instagram numa página de post (`instagram.com/p/CODIGO/`) ou de reel —
   a estrutura é mais previsível que o feed.
2. No painel, configure comentários (um por linha), limites e o intervalo
   (mín/máx em segundos).
3. Use **"Testar curtida"** e **"Testar comentário"** para validar que a
   interação funciona na aba aberta. *Os testes ignoram limites e não contam nos
   contadores — são só diagnóstico.*
4. Ative o interruptor no topo do painel para ligar a automação.

## Modos de operação

| Modo | O que faz | Onde usar |
|---|---|---|
| **Página atual** | Age (curtir/comentar) no post que está aberto na aba. | Post ou reel aberto. |
| **Feed (scroll)** | Rola a página e curte o primeiro post visível; com comentário ligado, também abre o post, comenta e fecha. | Home, explorar ou perfil. |
| **Lista de posts** | Abre cada URL da lista, curte/comenta e passa ao próximo. Ao terminar, para sozinha. | Colar URLs de posts/reels. |

### Lista de posts (modo lista)

1. Escolha o modo **Lista de posts**.
2. Cole um URL por linha (ex.: `https://www.instagram.com/p/ABC123/`,
   `https://www.instagram.com/reel/DEF456/`).
3. Ative o interruptor. A extensão abre o primeiro post, age, e segue a lista
   usando o intervalo "Mínimo/Máximo (s)" entre um post e outro.
4. O progresso aparece no painel (`2/10`). Ao concluir, a automação **para
   sozinha**; use **"Reiniciar lista"** para rodar de novo do zero.

### Feed (modo scroll)

1. Escolha o modo **Feed — scrollar e curtir** e deixe a aba na home/explorar.
2. A extensão rola `Passo (px)` a cada `Intervalo (s)` e curte o primeiro post
   visível ainda não curtido.
3. Se **Comentar automaticamente** estiver ligado, ela também abre o post
   (clicando no balão de comentário), comenta e fecha o modal — respeitando o
   limite diário de comentários e a mesma chance (~8%) usada nos outros modos.
4. Ajuste o passo e o intervalo no painel conforme a densidade do feed.

## Configuração

| Campo | Default | Descrição |
|---|---|---|
| Modo de operação | página atual | `current`, `feed` ou `list`. |
| Lista de posts | vazio | Um URL por linha (modo lista). |
| Passo (px) / Intervalo (s) | 800 / 6 | Scroll do feed: quanto rola e a cada quanto tempo. |
| Curtir automaticamente | ligado | Habilita curtidas. |
| Comentar automaticamente | desligado | Habilita comentários (usa o pool abaixo). |
| Mínimo/Máximo (s) | 30–120 | Delay aleatório entre ações (modo atual/lista). |
| Curtidas / hora | 25 | Teto por hora. |
| Curtidas / dia | 150 | Teto por dia. |
| Comentários / dia | 8 | Teto diário de comentários. |

Os contadores de hoje aparecem no painel e podem ser zerados manualmente.

## Como funciona

### Arquitetura

A extensão tem três partes que conversam por mensagens:

| Parte | Arquivo | Responsabilidade |
|---|---|---|
| **Background** (event page) | `background/background.js` | Agendamento (`browser.alarms`), limites/contadores, navegação e despacho das ações. |
| **Content script** | `content/content.js` | Manipula o DOM do Instagram: acha e clica no botão de curtir, preenche/publica comentário e rola o feed. |
| **Popup** | `popup/*` | Painel de configuração; lê/grava a config e envia comandos manuais (testar, reiniciar lista). |

`common/config.js` é compartilhado pelo background e pelo popup: define os
defaults, a chave de storage e os helpers de leitura/gravação.

### Ciclo de uma ação

1. O background agenda a próxima ação com `browser.alarms` usando um delay
   aleatório (`delayMinSec`–`delayMaxSec`; no modo feed, `scrollDelaySec`).
2. Quando o alarme dispara, o comportamento depende do modo:
   - **current**: age no post aberto da aba.
   - **feed**: envia `scrollAndLike` (rola + curte) ou `openAndComment` (abre o
     post, comenta e fecha o modal).
   - **list**: navega a aba até o próximo URL (`tabs.update`), espera o content
     script responder um `ping` com a URL correta, e então age.
3. O background envia a ação via `tabs.sendMessage`; o content script executa e
   devolve `{ ok, reason, ... }`.
4. Se deu certo, o background incrementa os contadores e grava no storage; ao
   virar o dia/hora, os contadores zeram.

### Como o botão de curtir é encontrado

O Instagram usa classes ofuscadas e troca o DOM com frequência, então a busca
não depende de CSS. Em vez disso:

- Procura `svg[aria-label]`, `[role="button"][aria-label]`, `button[aria-label]`
  e `a[aria-label]`.
- Lê o rótulo via `aria-label` ou o `<title>` interno do SVG.
- Normaliza (minúsculas, sem acentos) e compara com uma lista de palavras de
  "curtir" em vários idiomas (`curtir`, `like`, `gostei`, `me gusta`, `j'aime`…),
  ignorando os estados "já curtido" (`descurtir`, `unlike`, `no me gusta`…).
- O elemento clicável é o ancestral `button`, `[role="button"]` ou `a` mais
  próximo — importante porque o botão de curtir hoje é um `<div role="button">`.

### Como o comentário é enviado

O Instagram é um app React; setar `textarea.value` direto não dispara os
listeners. Por isso o content script:

1. Acha o textarea de comentário.
2. Usa o *native setter*
   (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`)
   e dispara `input`/`change` para o React registrar o texto.
3. Publica pelo `button[type="submit"]` **dentro do `<form>`** do comentário
   (fallback: `div[role="button"]` não desabilitada dentro do mesmo form).

### Configuração e estado

- Tudo fica em `browser.storage.local` na chave `extensaoDoidaConfig`.
- `counters` guarda `likesDay`, `likesHour`, `commentsDay` + as chaves `date`/`hour`
  usadas para zerar ao virar o dia/hora.
- `postList` e `listIndex` controlam o progresso do modo lista.
- O background reage a `storage.onChanged` apenas quando `enabled` muda de valor,
  para ligar/desligar o agendamento sem interferir nos contadores.

## Limitações / manutenção

- O Instagram muda as classes CSS e o DOM com frequência. A busca usa atributos
  de acessibilidade (`aria-label`), que são mais estáveis, mas **ainda assim
  vão quebrar** eventualmente — espere precisar de manutenção.
- O idioma da conta afeta os `aria-label`. Já há suporte a PT/EN/ES/FR/DE/IT;
  adicione mais em `LIKE_WORDS`/`UNLIKE_WORDS` e no detector de comentário em
  `content/content.js`.
- Navegadores podem limitar a frequência mínima de alarmes (~30s no Chrome).
  No Firefox, delays abaixo de 30s costumam funcionar.
- Abas abertas antes da instalação não têm o content script até serem recarregadas.

## Aviso final

Mantenha os limites **baixos** (ex.: 20–30 curtidas/hora e 5–10 comentários/dia)
e varie os comportamentos. Automatizar interações é o caminho mais rápido para o
banimento da conta — use com moderação e apenas por aprendizado.
