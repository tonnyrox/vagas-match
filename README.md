# Vagas Match — Documentação Única (Extensão Chrome)

> Extensão que mostra em **tempo real** o match entre seu currículo e vagas de
> emprego (LinkedIn, Indeed, Jobbol). Analisa a vaga e indica se vale aplicar.
> Versão do manifest: **1.8.0** · Autor: tonnyrox.

---

## 1. Visão Geral

- Badge flutuante no canto inferior direito com **Match Score (0–100%)**.
- Cores: 🟢 Azul (70%+) = bom match · 🟡 Amarelo (40–69%) = parcial · 🔴 Vermelho (0–39%) = baixo.
- Bloqueios automáticos (score 0): empresa bloqueada, agência de marketing, bairro bloqueado.
- Análise de remuneração extra (comissão, bônus, PLR) e benefícios (plano de saúde, VR, VA, VT, etc.).
- **Selinhos (chips) no badge:** modalidade de contratação (CLT/PJ), remuneração extra e
  benefícios aparecem como selinhos curtos lado a lado (ex.: `VR` `VA` `VT`), em vez de texto
  corrido. Veja a seção 10.
- **Página de opções personalizável:** dá pra adicionar itens livres (ex.: outro bairro) em
  qualquer lista e remover só os que você adicionou. Veja a seção 11.

---

## 2. Instalação

1. `chrome://extensions/` → ativar **Modo do desenvolvedor**.
2. **Carregar extensão sem compactar** → selecionar a pasta do projeto:
   ```
   C:\Users\Tonny\Downloads\extensao_trabalho_google\
   ```
3. O ícone "VM" aparece na barra. Recarregue sempre que editar `content.js`/`config.js`.

---

## 3. Como Usar

### Badge flutuante
Abre sozinho ao entrar numa vaga (ou na página de busca do LinkedIn).
- Aparece no canto inferior direito.
- Mostra score, detalhes da análise e status.
- Ao clicar num card de vaga, a URL muda e o badge re-analisa a vaga clicada.

### Popup (ícone VM)
- Clica no ícone → mostra score, tempo e detalhes da vaga atual.
- Botão **⚙ Configurações** abre a página de opções.

### Configurações (opções)
Acesse via ícone → ⚙ ou `chrome://extensions/` → engrenagem da Vagas Match.
- Liga/desliga: áreas, cargos de foco, setores preferidos/evitados, competências, cidades, empresas/bairros bloqueados.
- Salário mínimo (R$ 2.600) e dias máximos (7).
- Botão **Salvar** e **Restaurar padrões**.

---

## 4. Como a Análise Funciona

`analisarMatch()` pontua estes critérios (cada um conta para o score):

| Critério | Peso | O que verifica |
|----------|------|----------------|
| Localização | 1 | Goiânia/Aparecida ou Remoto/Home Office |
| Remuneração extra | 1 | Comissão, bônus, gratificação, bonificação, premiação, PLR |
| Benefícios | 1 | Plano saúde, odonto, VR, VA, VT, day off, seguro |
| Cargo | 1 | Título combina com cargos de foco |
| Setor | 1 | Tech/SaaS (preferido) ou setor evitado |
| Competências | 1 | Skills aparecem na descrição (≥3 = ok) |
| Área | 1 | Combina com áreas pretendidas |
| Descrição | 1 | Tem detalhes suficientes |

`score = round((pontos / total) * 100)`.

**Bloqueios (score 0):** empresa na lista bloqueada · agência de marketing · bairro bloqueado (Genoveva).

> ⚠️ **Regras ainda NÃO aplicadas no score** (documentadas no currículo, pendentes de implementar): salário mínimo abaixo de R$ 2.600 e filtro de recência por "dias máximos". Hoje o bloqueio é só por empresa/agência/bairro.

---

## 5. Página Principal de Uso/Teste (LinkedIn)

Use a **página agregadora** (busca com duas colunas: lista + painel de detalhe):

```
https://www.linkedin.com/jobs/search/?currentJobId=4457165494&f_TPR=r604800&keywords=assistente%20comercial&location=Goi%C3%A2nia%2C%20GO
```

- `currentJobId` = vaga destacada no painel.
- `f_TPR=r604800` = vagas dos últimos 7 dias.
- Ao clicar num card, a URL vira `/jobs/view/<id>` e o badge re-analisa.

---

## 6. BUG CONHECIDO E FIX (layout novo do LinkedIn)

**Sintoma:** extensão parou de mostrar o score ("Analisando vaga..." / `--`).

**Causa:** o LinkedIn mudou o layout das páginas de vaga:
- Removeu `.scaffold-layout__detail` (some em vagas diretas `/jobs/view/`).
- Removeu o `<h1>` do título da vaga (não existe `<h1>` na vaga direta).
- Classes viraram hashes ofuscados (`_901df6e6`...), sem BEM estável.

Como `extractJobData()` dependia de `.scaffold-layout__detail h1`, não achava
título/descrição → score vazio.

**Fix em `content.js`** (`extractJobData`, branch linkedin):
1. Painel com fallbacks: `.scaffold-layout__detail` → `aside` → `.jobs-box__html-content` → `main`.
2. Título: `h1` → links `/jobs/view/` → `h2/h3` → **fallback `document.title`** (`TITULO | EMPRESA | LinkedIn`).
3. Empresa: links `/company/` → **fallback `document.title`**.
4. Descrição: `AboutTheJob` → seção `## Sobre a vaga` → maior `<p>`.
5. `watchDetailPanel()` inclui `.jobs-box__html-content`.

**Validação:** na agregadora a extração retornou título + empresa + local +
descrição de 2559 chars (score calculado). Na vaga direta, título/empresa vêm do
`document.title` (OK); descrição pode vir curta se o LinkedIn mantiver "ver mais"
colapsado (caso secundário).

**Para aplicar:** recarregue a extensão em `chrome://extensions/` (🔄) e F5 na aba.

**Seletores confiáveis atuais:**
- Lista: `a[href*="/jobs/view/"]`
- Painel clássico: `.scaffold-layout__detail` · novo: `.jobs-box__html-content` / `main`
- Título/empresa: `document.title`
- Descrição: `h2` "Sobre a vaga" → `parentElement`
- Badge: `#vagas-match-badge` · score: `#vm-score` · detalhes: `#vm-details`

### 6.1 Análise: somente na visão agregadora (desligada na página individual)

> **Decisão (v1.7.7):** a extensão analisa vagas **apenas na visão agregadora**
> (`/jobs/search/` — busca com lista de vagas). A análise na **página individual
> isolada** (`/jobs/view/` aberta direto) está **desligada**. Além disso, o badge
> `#vagas-match-badge` (se vier "arrastado" da agregadora via SPA) é **removido/
> ocultado** na página individual. O `initJobPage()` segue no código mas não é
> mais chamado.

### 6.2 Badge sem campos de detalhe (v1.7.7)

O badge (`#vagas-match-badge`) **não exibe mais** os `match-item` da análise
(Descrição/Área/Competências/Salário/Local etc.). No `renderResult()` de
`content.js`, `detailsEl.innerHTML` recebe apenas o resumo do job
(título/empresa/modalidade/benefícios), quando houver. O score e o status
continuam aparecendo.

Na visão agregadora, a extensão mantém o comportamento anterior (badge em cada
card + análise do painel de detalhe ao selecionar uma vaga). O detalhe abaixo
descreve a regra mestre que **costumava** rodar na individual (mantida como
> referência, inativa):

1. **Detecta** o botão de expandir descrição pelo seletor estável do LinkedIn:
   `button[data-testid="expandable-text-button"]` (texto **"… mais"** — NÃO é
   "ver mais"/"mostrar mais", e NUNCA é o "Ver mais vagas como esta" de recomendações).
2. **Enquanto** esse botão existir → clica para expandir tudo (status
   **"Ativando descrição..."**). Ao clicar, a descrição cresce (ex.: de ~2000
   para ~5000 caracteres dentro de `p[data-testid="expandable-text-box"]`).
3. **Quando o botão some** (descrição toda aberta) **ou** se nunca existiu →
   faz a análise completa.
4. Se após 20 tentativas (≈24s) o botão não some (descrição não carrega no
   navegador automatizado), analisa com o que tiver (título/cargo/setor/empresa).
5. `MutationObserver` re-analisa a qualquer mudança no painel.

Funções em `content.js`: `temBotaoVerMais()`, `expandirDescricao()` e o loop em
`initJobPage()`.

> Nota: em alguns navegadores automatizados o LinkedIn não renderiza o texto da
> descrição na página individual (lazy-load/anti-bot) — nesse caso nem o
> `expandable-text-box` aparece e a análise fica parcial. Use a página agregadora
> (busca) para análise completa quando isso ocorrer.

Recarregue a extensão (`chrome://extensions/` 🔄) para ativar.

---

## 8. Arquivos do Projeto

```
extensao_trabalho_google/
├── manifest.json            # configuração (MV3, v1.7.7)
├── config.js                # PERFIL+REGRAS REAL (gitignored — NÃO compartilhar)
├── config.example.js        # template sem dados pessoais (copie p/ config.js)
├── content.js               # lógica principal (badge + análise + extração)
├── content.css              # estilos do badge
├── background.js            # service worker
├── popup.html / popup.js    # janela do ícone
├── options.html / options.js# página de configurações
├── diagnostico_extensao.py  # script de verificação/depuração
├── LICENSE                  # MIT (veja seção 10)
├── .gitignore               # protege config.js e dados pessoais
├── README.md                # este arquivo (documentação única)
└── .venv/                   # ambiente virtual Python + gh (gitignored)
```

> **Dados pessoais:** `config.js` e o arquivo de currículo do usuário
> estão no `.gitignore` — permanecem só na sua máquina e nunca são enviados ao Git.

---

## 9. Versionamento

- **Manifest:** 1.7.7 (fonte da verdade para versão).
- Outros arquivos tinham versões defasadas (README antigo 1.3.0, popup 1.1, etc.);
  consolida-se aqui em 1.7.7.

---

## 10. Licença MIT e Proteção de Dados

### 10.1 Licença e repositório público
O projeto é **MIT** (arquivo `LICENSE`): qualquer pessoa pode usar, copiar,
modificar e distribuir — inclusive mexer no código. Basta manter o aviso de
copyright.

Repositório (privado): **https://github.com/tonnyrox/vagas-match**
(contém só arquivos seguros; `config.js` e dados pessoais ficam de fora via `.gitignore`).

> Plataformas: hoje os seletores de extração funcionam no **LinkedIn** (agregadora
> e, via `config.js`, qualquer vaga), e o `manifest.json` já inclui matches para
> **Indeed** e **Jobbol**. A lógica em `content.js` (branch por site em
> `extractJobData`) pode ser estendida para outras plataformas.

**Como instalar (terceiros):**
1. Clone o repo e carregue a pasta em `chrome://extensions/` (Modo do desenvolvedor).
2. Copie `config.example.js` → `config.js` e preencha **seus** dados (o `config.js`
   real não vai no repo, por privacidade).
3. Recarregue a extensão ao editar `content.js`/`config.js`.

### 10.2 Proteção de dados pessoais
`config.js` (seu perfil real) e o arquivo de currículo estão
no `.gitignore`. Para compartilhar o projeto sem vazar dados, envie apenas:
`manifest.json`, `content.js`, `content.css`, `background.js`, `popup.*`,
`options.*`, `config.example.js`, `README.md`, `LICENSE`.
O `config.js` real fica só na sua máquina.