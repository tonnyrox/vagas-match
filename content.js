(() => {
  if (document.getElementById('vagas-match-badge')) return;

  // Config padrão (vem do config.js → PERFIL)
  const DEFAULT_CONFIG = {
    areas: [...PERFIL.areas],
    cargos_foco: [...PERFIL.cargos_foco],
    setores_preferidos: [...PERFIL.setores_preferidos],
    setores_evitados: [...PERFIL.setores_evitados],
    competencias: [...PERFIL.competencias],
    cidades: [...PERFIL.cidades],
    empresas_bloqueadas: [...PERFIL.empresas_bloqueadas],
    bairros_bloqueados: [...PERFIL.bairros_bloqueados],
    agencia_marketing_bloqueada: PERFIL.agencia_marketing_bloqueada,
    agencia_marketing_termos: [...PERFIL.agencia_marketing_termos],
    salario_minimo: PERFIL.salario_minimo || 2600,
    dias_maximos: REGRAS.dias_maximos_vaga || 7
  };

  // Carregar config salva (ou usar padrão)
  let USER_CONFIG = { ...DEFAULT_CONFIG };

  function loadUserConfig() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get('vagasMatchConfig', (data) => {
          if (data.vagasMatchConfig) {
            USER_CONFIG = { ...DEFAULT_CONFIG, ...data.vagasMatchConfig };
          }
          resolve(USER_CONFIG);
        });
      } catch(e) {
        // Fallback: usar config padrão se chrome.storage não existir
        resolve(USER_CONFIG);
      }
      // Timeout: se não resolver em 500ms, usar padrão
      setTimeout(() => resolve(USER_CONFIG), 500);
    });
  }

  // Badge HTML
  const badge = document.createElement('div');
  badge.id = 'vagas-match-badge';
  badge.innerHTML = `
    <div class="badge-content">
      <div class="match-score">
        <div class="score-circle" id="vm-score-circle">
          <span id="vm-score">--</span>
        </div>
        <div class="label">Match Score</div>
      </div>
      <div class="match-details" id="vm-details"></div>
      <div class="status-bar">
        <div class="dot"></div>
        <span id="vm-status">Analisando vaga...</span>
      </div>
    </div>
  `;
  document.body.appendChild(badge);

  function detectSite() {
    const host = location.hostname;
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('indeed.com')) return 'indeed';
    if (host.includes('jobbol.com')) return 'jobbol';
    return 'unknown';
  }

  // Detectar se é página de busca (listagem de vagas)
  function isSearchPage() {
    const url = location.href;
    return url.includes('/jobs/search') || url.includes('/jobs/') && !url.includes('/jobs/view/');
  }

  // Extrair dados básicos de um card de vaga na listagem (LinkedIn)
  function extractJobCardData(card) {
    let titulo = '', empresa = '', local = '', jobId = '', logo = '';

    // Job ID do componentkey
    const ck = card.getAttribute('componentkey') || '';
    const ckMatch = ck.match(/job-card-component-ref-(\d+)/);
    if (ckMatch) jobId = ckMatch[1];

    // Logo da empresa: img dentro do card
    const logoImg = card.querySelector('img[src*="company"]') || card.querySelector('img[alt]');
    if (logoImg) {
      logo = logoImg.getAttribute('src') || '';
    }

    // Título: link com href para /jobs/view/
    const titleLink = card.querySelector('a[href*="/jobs/view/"]');
    if (titleLink) {
      titulo = titleLink.innerText?.trim() || '';
      if (!jobId) {
        const hrefMatch = titleLink.getAttribute('href')?.match(/\/view\/(\d+)/);
        if (hrefMatch) jobId = hrefMatch[1];
      }
    }

    // Fallback: spans maiores que parecem título
    if (!titulo) {
      const spans = card.querySelectorAll('span');
      for (const span of spans) {
        const text = span.innerText?.trim();
        if (text && text.length > 8 && text.length < 150
            && !text.includes('há') && !text.includes('pessoa')
            && !text.includes('seguidores') && !text.includes('Anunciada')) {
          titulo = text;
          break;
        }
      }
    }

    // Empresa e Local: parágrafos curtos no card
    const paragraphs = card.querySelectorAll('p');
    const candidatos = [];
    for (const p of paragraphs) {
      const text = p.innerText?.trim();
      if (text && text.length > 2 && text.length < 100
          && !text.includes('há') && !text.includes('pessoa')
          && !text.includes('Visto') && !text.includes('Anunciada')
          && !text.includes('seguidores')) {
        candidatos.push(text);
      }
    }
    if (candidatos.length >= 2) {
      empresa = candidatos[0];
      local = candidatos[1];
    } else if (candidatos.length === 1) {
      empresa = candidatos[0];
    }

    // Local: detectar padrões conhecidos
    if (!local) {
      const allText = card.innerText;
      const localMatch = allText.match(/(Goiânia|Goiás|Anápolis|Aparecida|Brasília|Remoto|Home Office|Híbrido|Presencial)[^\.]*/i);
      if (localMatch) local = localMatch[0].trim();
    }

    return { titulo, empresa, local, jobId, logo };
  }

  // Analisar card de vaga rapidamente (mesmos critérios do analisarMatch)
  function quickAnalyzeCard(cardData) {
    const detalhes = [];
    let pontos = 0;
    let total = 0;

    const tituloLower = cardData.titulo.toLowerCase();
    const empresaLower = cardData.empresa.toLowerCase();
    const localLower = cardData.local.toLowerCase();

    // Empresa bloqueada
    if (USER_CONFIG.empresas_bloqueadas.some(e => empresaLower.includes(e))) {
      return { score: 0, bloqueado: true, motivo: 'Empresa bloqueada', detalhes: ['Empresa bloqueada'] };
    }

    // Agência de marketing
    if (USER_CONFIG.agencia_marketing_bloqueada) {
      if (USER_CONFIG.agencia_marketing_termos.some(t => empresaLower.includes(t) || tituloLower.includes(t))) {
        return { score: 0, bloqueado: true, motivo: 'Agência de marketing', detalhes: ['Agência de marketing'] };
      }
    }

    // Localização (peso 1) — MESMO critério do analisarMatch
    total++;
    if (USER_CONFIG.cidades.some(c => localLower.includes(c.toLowerCase()))) {
      pontos++;
      detalhes.push('📍 Local OK');
    } else if (localLower.includes('remoto') || localLower.includes('home office') || localLower.includes('hybrid')) {
      pontos += 0.5;
      detalhes.push('📍 Remoto');
    } else {
      detalhes.push('📍 Local diferente');
    }

    // Cargo (peso 1) — MESMO critério do analisarMatch
    total++;
    const cargoTermos = tituloLower.split(/\s+/);
    const cargoFoco = USER_CONFIG.cargos_foco.some(c => {
      const cLower = c.toLowerCase();
      return tituloLower.includes(cLower) ||
             cargoTermos.some(t => cLower.includes(t) && t.length > 3);
    });
    if (cargoFoco) {
      pontos++;
      detalhes.push('💼 Cargo OK');
    } else {
      detalhes.push('💼 Cargo não identificado');
    }

    // Setor (peso 1) — MESMO critério do analisarMatch
    total++;
    const setorOk = USER_CONFIG.setores_preferidos.some(s => tituloLower.includes(s.toLowerCase()));
    const setorEvitado = USER_CONFIG.setores_evitados.some(s => tituloLower.includes(s.toLowerCase()));
    if (setorOk) {
      pontos++;
      detalhes.push('🏢 Setor OK');
    } else if (setorEvitado) {
      detalhes.push('🚫 Setor evitado');
    }

    // Área (peso 1) — MESMO critério do analisarMatch
    total++;
    const areaOk = USER_CONFIG.areas.some(a => tituloLower.includes(a.toLowerCase()));
    if (areaOk) {
      pontos++;
      detalhes.push('📊 Área OK');
    }

    const score = Math.max(0, Math.min(100, Math.round((pontos / total) * 100)));
    return { score, bloqueado: false, detalhes };
  }

  // Mini badge DESATIVADO — não mostra nada nos cards
  function createMiniBadge(card, score, bloqueado, detalhes, logo) {
    return;
  }

  // Processar cards na página de busca (LinkedIn) — sem clicar, dados visíveis
  function processSearchPage() {
    // Encontrar todos os links /jobs/view/ que NÃO estão no painel de detalhe
    const allLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
    const detailPanel = document.querySelector('.scaffold-layout__detail') || document.querySelector('aside');

    const listLinks = [];
    allLinks.forEach(link => {
      // Excluir links que estão dentro do painel de detalhe
      if (detailPanel && detailPanel.contains(link)) return;
      // Excluir links muito curtos (provavelmente ícones)
      if (!link.innerText || link.innerText.trim().length < 3) return;
      listLinks.push(link);
    });

    if (listLinks.length === 0) return;

    let processadas = 0;
    const maxProcessar = 15;

    for (const link of listLinks) {
      if (processadas >= maxProcessar) break;

      // Encontrar o card: subir até achar um container com tamanho razoável
      let card = link;
      for (let i = 0; i < 20; i++) {
        if (!card.parentElement) break;
        card = card.parentElement;
        // Parar quando achar um container que parece card
        const h = card.offsetHeight;
        const w = card.offsetWidth;
        if (h >= 60 && h <= 500 && w > 100) break;
        // Também parar se achar artdeco-entity-lockup (estrutura LinkedIn)
        if (card.classList && card.classList.contains('artdeco-entity-lockup')) break;
      }

      // Pular se já tem badge ou se é o painel de detalhe
      if (card.querySelector('.vm-mini-badge')) continue;
      if (detailPanel && detailPanel.contains(card)) continue;

      // Extrair dados
      const titulo = link.getAttribute('aria-label') || link.innerText?.trim().split('\n')[0] || '';
      if (!titulo || titulo.length < 3) continue;

      // Empresa: .artdeco-entity-lockup__subtitle > span
      let empresa = '';
      const subtitleEl = card.querySelector('.artdeco-entity-lockup__subtitle span');
      if (subtitleEl) {
        empresa = subtitleEl.innerText?.trim() || '';
      }

      // Local: .artdeco-entity-lockup__caption > ul > li > span
      let local = '';
      const captionEl = card.querySelector('.artdeco-entity-lockup__caption span');
      if (captionEl) {
        local = captionEl.innerText?.trim() || '';
      }

      // Fallback: buscar em spans do card
      if (!empresa || !local) {
        const allSpans = card.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.innerText?.trim();
          if (!text || text.length < 2 || text.length > 100) continue;
          if (/\d+\s*h[aá]/.test(text)) continue;
          if (/candidat/.test(text)) continue;
          if (/Anunciada|Visto|Promovida|Visualizado/.test(text)) continue;
          if (/seguidor/.test(text)) continue;
          if (/Simplificada|Candidatura/.test(text)) continue;
          if (text === titulo) continue;
          if (!empresa && text.length > 2 && text.length < 80) {
            empresa = text;
          } else if (!local && text.length > 2) {
            local = text;
            break;
          }
        }
      }

      // Logo
      const logoImg = card.querySelector('img[src*="company"]') || card.querySelector('img[src*="logo"]') || card.querySelector('img[alt*="Logo"]');
      const logo = logoImg?.getAttribute('src') || '';

      // Job ID
      const dataJobId = card.getAttribute('data-job-id') || '';
      const href = link.getAttribute('href') || '';
      const hrefMatch = href.match(/\/view\/(\d+)/);
      const jobId = dataJobId || (hrefMatch ? hrefMatch[1] : '');

      const cardData = { titulo, empresa, local, jobId, logo };
      const result = quickAnalyzeCard(cardData);

      // Criar badge no card
      createMiniBadge(card, result.score, result.bloqueado, result.detalhes || [], logo);
      processadas++;
    }

    if (processadas > 0) {
      const statusEl = document.getElementById('vm-status');
      if (statusEl) statusEl.textContent = processadas + ' vagas analisadas';
    }
  }

  // MutationObserver: detectar novos cards no DOM (LinkedIn carrega/virtualiza via AJAX)
  function startObserver() {
    const target = document.querySelector('[data-view-name="search-results"]')
                 || document.querySelector('.scaffold-layout__list')
                 || document.querySelector('main')
                 || document.body;

    const observer = new MutationObserver(() => {
      clearTimeout(window._vmTimer);
      window._vmTimer = setTimeout(processSearchPage, 300);
    });

    observer.observe(target, { childList: true, subtree: true });

    // Observer no body inteiro (captura virtualização)
    const bodyObserver = new MutationObserver(() => {
      clearTimeout(window._vmTimer2);
      window._vmTimer2 = setTimeout(processSearchPage, 500);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Observer na lista de cards (captura scroll/virtualização)
    const listEl = document.querySelector('ul.szzxFSIiHvFEGRQhPLNfDPmGkHiNIFCOY')
                || document.querySelector('.scaffold-layout__list ul');
    if (listEl) {
      const listObserver = new MutationObserver(() => {
        clearTimeout(window._vmTimer3);
        window._vmTimer3 = setTimeout(processSearchPage, 200);
      });
      listObserver.observe(listEl, { childList: true, subtree: true });
    }
  }

  // =============================================
  // PÁGINA DE BUSCA: mini badges + análise ao clicar
  // =============================================

  let lastJobId = null;
  let lastUrl = location.href;

  function getCurrentJobIdFromUrl() {
    const m = location.href.match(/currentJobId=(\d+)/);
    return m ? m[1] : null;
  }

  function getJobIdFromViewUrl() {
    const m = location.href.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  }

  // Expandir a descricao: clica o botao real "… mais" do LinkedIn
  // (data-testid="expandable-text-button"). Esse e o seletor estavel — o texto
  // vem como "… mais", e NAO "ver mais"/"mostrar mais". Nunca clica o
  // "Ver mais vagas como esta" (recomendacoes), que e outro elemento.
  function expandirDescricao() {
    try {
      const botoes = document.querySelectorAll('button[data-testid="expandable-text-button"]');
      for (const b of botoes) b.click();
      return botoes.length > 0;
    } catch (e) {}
    return false;
  }

  // Verifica se AINDA existe o botão "… mais" (descrição colapsada)
  function temBotaoVerMais() {
    return document.querySelectorAll('button[data-testid="expandable-text-button"]').length > 0;
  }

  // Analisar vaga detalhada e atualizar o badge principal
  function analyzeCurrentDetail() {
    expandirDescricao();
    const jobData = extractJobData();
    if (!jobData.titulo) return false;

    const result = analisarMatch(jobData);
    result.jobData = jobData;
    renderResult(result);
    try { chrome.runtime.sendMessage({ type: 'JOB_DATA', data: jobData, result }); } catch(e) {}
    return true;
  }

  // Observer no painel de detalhe (lado direito)
  let detailObserver = null;
  function watchDetailPanel() {
    if (detailObserver) detailObserver.disconnect();
    const panel = document.querySelector('[data-test="job-details"]')
               || document.querySelector('.scaffold-layout__detail')
               || document.querySelector('aside')
               || document.querySelector('.jobs-box__html-content')
               || document.querySelector('section[aria-label]');
    if (!panel) return;
    detailObserver = new MutationObserver(() => {
      clearTimeout(window._vmDetailTimer);
      window._vmDetailTimer = setTimeout(analyzeCurrentDetail, 300);
    });
    detailObserver.observe(panel, { childList: true, subtree: true });
  }

  // Monitorar URL (LinkedIn SPA — não recarrega)
  function monitorUrlChanges() {
    // Polling a cada 200ms
    setInterval(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        const jobId = getCurrentJobIdFromUrl() || getJobIdFromViewUrl();
        if (jobId) {
          lastJobId = jobId;
          // Analisar com delays progressivos
          setTimeout(() => analyzeCurrentDetail(), 1000);
          setTimeout(() => analyzeCurrentDetail(), 2000);
          setTimeout(() => analyzeCurrentDetail(), 3000);
          setTimeout(() => { analyzeCurrentDetail(); watchDetailPanel(); }, 4000);
        }
      }
    }, 200);

    // Botão voltar
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        const jobId = getCurrentJobIdFromUrl() || getJobIdFromViewUrl();
        if (jobId) {
          lastJobId = jobId;
          analyzeCurrentDetail();
          watchDetailPanel();
        }
      }, 300);
    });

    // Clique nos cards
    document.addEventListener('click', (e) => {
      let card = e.target.closest('[componentkey*="job-card-component-ref"]');
      if (!card) card = e.target.closest('a[href*="/jobs/view/"]');
      if (!card) card = e.target.closest('[data-view-name="job-card"]');
      if (!card) card = e.target.closest('.scaffold-layout__list-item');

      if (card) {
        const ck = card.getAttribute('componentkey') || '';
        const m = ck.match(/job-card-component-ref-(\d+)/);
        if (m) {
          lastJobId = m[1];
        } else {
          const link = card.querySelector('a[href*="/jobs/view/"]') || card;
          const href = link.getAttribute?.('href') || '';
          const hrefMatch = href.match(/\/view\/(\d+)/);
          if (hrefMatch) lastJobId = hrefMatch[1];
        }

        // Analisar com múltiplos delays
        setTimeout(() => analyzeCurrentDetail(), 1500);
        setTimeout(() => analyzeCurrentDetail(), 2500);
        setTimeout(() => analyzeCurrentDetail(), 3500);
        setTimeout(() => { analyzeCurrentDetail(); watchDetailPanel(); }, 5000);
      }
    }, true);
  }

  function extractJobData() {
    const site = detectSite();
    let titulo = '', empresa = '', local = '', descricao = '', salario = '', modalidade = '', jobId = '', logo = '';

    if (site === 'linkedin') {
      // Extrair job ID da URL
      const urlMatch = location.href.match(/currentJobId=(\d+)/) || location.href.match(/\/view\/(\d+)/);
      jobId = urlMatch ? urlMatch[1] : '';

      // PAINEL DE DETALHE — é onde está a vaga correta
      // Inclui fallbacks para o NOVO layout do LinkedIn (sem .scaffold-layout__detail / sem <h1>)
      // .jobs-box__html-content vem ANTES de aside para não pegar a barra lateral errada
      const detailPanel = document.querySelector('.scaffold-layout__detail')
                         || document.querySelector('[data-test="job-details"]')
                         || document.querySelector('.jobs-box__html-content')
                         || document.querySelector('aside')
                         || document.querySelector('main');

      // LOGO da empresa — dentro do painel
      const logoImg = detailPanel?.querySelector('img[src*="company"]')
                   || detailPanel?.querySelector('.artdeco-entity-image img')
                   || detailPanel?.querySelector('img');
      if (logoImg) logo = logoImg.getAttribute('src') || '';

      // TITULO — buscar APENAS dentro do painel de detalhe
      if (detailPanel) {
        titulo = detailPanel.querySelector('h1')?.innerText?.trim() || '';
        if (!titulo) {
          const titleLinks = detailPanel.querySelectorAll('a[href*="/jobs/view/"]');
          for (const link of titleLinks) {
            const text = link.innerText?.trim();
            if (text && text.length > 3) { titulo = text; break; }
          }
        }
        if (!titulo) {
          const headings = detailPanel.querySelectorAll('h2, h3');
          for (const h of headings) {
            const text = h.innerText?.trim();
            if (text && text.length > 3 && !text.includes('Sobre') && !text.includes('Benefícios')) {
              titulo = text;
              break;
            }
          }
        }
      }
      // Fallback: h1 geral (menos confiável)
      if (!titulo) titulo = document.querySelector('h1')?.innerText?.trim() || '';
      // Fallback: título da página (NOVO layout do LinkedIn não tem <h1>)
      if (!titulo && document.title) {
        const m = document.title.match(/^(.*?)\s*\|\s*(.*?)\s*\|\s*LinkedIn/i);
        if (m) titulo = m[1].trim();
        else titulo = document.title.split('|')[0].trim();
      }

      // EMPRESA — buscar dentro do painel
      if (detailPanel) {
        const companyLinks = detailPanel.querySelectorAll('a[href*="/company/"]');
        for (const link of companyLinks) {
          const text = link.innerText?.trim();
          if (text && text.length > 2 && !text.includes('LinkedIn')) {
            empresa = text;
            break;
          }
        }
        if (!empresa) {
          const empresaEl = detailPanel.querySelector('[aria-label*="Empresa"]') || detailPanel.querySelector('[aria-label*="Company"]');
          if (empresaEl) empresa = empresaEl.getAttribute('aria-label').replace('Empresa ', '').replace('Company ', '').replace('.', '').trim();
        }
        if (!empresa) {
          const ps = detailPanel.querySelectorAll('p');
          for (const p of ps) {
            const text = p.innerText?.trim();
            if (text && text.length > 2 && text.length < 60 && !text.includes('candidatura') && !text.includes('dia') && !text.includes('promovida')) {
              empresa = text;
              break;
            }
          }
        }
      }

      // Fallback: empresa a partir do <title> (NOVO layout)
      if (!empresa && document.title) {
        const m = document.title.match(/^(.*?)\s*\|\s*(.*?)\s*\|\s*LinkedIn/i);
        if (m) empresa = m[2].trim();
      }

      // LOCAL — dentro do painel
      if (detailPanel) {
        const allSpans = detailPanel.querySelectorAll('span');
        const localPatterns = /Goiânia|Goiás|Brasil|Remoto|Home Office|Híbrido|Presencial|Anápolis|Aparecida/i;
        for (const span of allSpans) {
          const text = span.innerText?.trim();
          if (text && localPatterns.test(text) && text.length < 100 && !text.includes('há')) {
            local = text;
            break;
          }
        }
      }

      // MODALIDADE — dentro do painel
      if (detailPanel) {
        const allSpans = detailPanel.querySelectorAll('span');
        const modalPatterns = /Presencial|Remoto|Home Office|Híbrido|Tempo integral|Meio período/i;
        const modalMatches = [];
        for (const span of allSpans) {
          const text = span.innerText?.trim();
          if (text && modalPatterns.test(text) && text.length < 30) {
            modalMatches.push(text);
          }
        }
        modalidade = [...new Set(modalMatches)].join(', ');
      }

      // DESCRICAO — buscar na página toda (na página INDIVIDUAL o container da
      // vaga pode ser qualquer .jobs-box__html-content, não o primeiro)
      if (detailPanel) {
        const aboutSection = detailPanel.querySelector('[id*="JobDetails_AboutTheJob"]') ||
                             detailPanel.querySelector('[id*="AboutTheJob"]');
        if (aboutSection) {
          const descParagraph = aboutSection.querySelector('[data-testid="expandable-text-box"]') ||
                                aboutSection.querySelector('p');
          if (descParagraph) descricao = descParagraph.innerText?.trim() || '';
        }
      }
      // Fallback: seção "Sobre a vaga" em qualquer lugar da página
      if (!descricao || descricao.length < 50) {
        let secAlvo = null;
        document.querySelectorAll('h2, h3').forEach((h) => {
          if (!secAlvo && /sobre a vaga/i.test(h.innerText || '')) secAlvo = h.parentElement;
        });
        if (secAlvo) descricao = secAlvo.innerText?.trim() || '';
      }
      // Fallback: maior .jobs-box__html-content da página (ignora boxes pequenos)
      if (!descricao || descricao.length < 50) {
        let maior = '';
        document.querySelectorAll('.jobs-box__html-content').forEach((box) => {
          const t = box.innerText?.trim() || '';
          if (t.length > 100 && t.length > maior.length) maior = t;
        });
        descricao = maior;
      }
      // Fallback: caixa de texto expansivel do LinkedIn (data-testid=expandable-text-box)
      if (!descricao || descricao.length < 50) {
        let maior = '';
        document.querySelectorAll('p[data-testid="expandable-text-box"]').forEach((box) => {
          const t = box.innerText?.trim() || '';
          if (t.length > maior.length) maior = t;
        });
        descricao = maior;
      }
      // Fallback: maior <p> do painel/documento
      if (!descricao || descricao.length < 50) {
        let maior = '';
        const paragraphs = (detailPanel || document).querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.innerText?.trim();
          if (text && text.length > maior.length) maior = text;
        }
        descricao = maior;
      }

    } else if (site === 'indeed') {
      titulo = document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim()
        || document.querySelector('h1')?.innerText?.trim() || '';
      empresa = document.querySelector('.jobsearch-InlineCompanyRating-companyHeader a')?.innerText?.trim()
        || document.querySelector('.jobsearch-InlineCompanyRating')?.innerText?.trim() || '';
      local = document.querySelector('.jobsearch-JobInfoHeader-companyLocation')?.innerText?.trim() || '';
      descricao = document.querySelector('.jobsearch-jobDescriptionText')?.innerText?.trim() || '';

    } else if (site === 'jobbol') {
      titulo = document.querySelector('.job-title, h1')?.innerText?.trim() || '';
      empresa = document.querySelector('.company-name, .employer')?.innerText?.trim() || '';
      local = document.querySelector('.location')?.innerText?.trim() || '';
      descricao = document.querySelector('.job-description, .description')?.innerText?.trim() || '';
    }

    return { site, titulo, empresa, local, descricao, salario, modalidade, jobId, logo };
  }

  // Extrair informações de salário, comissão, bônus e benefícios
  function extractSalaryInfo(descLower) {
    const info = {
      tem_salario: false,
      tem_comissao: false,
      tem_bonificacao: false,
      tem_gratificacao: false,
      tem_bonus: false,
      tem_premiacao: false,
      tem_plano_saude: false,
      tem_plano_odonto: false,
      tem_vale_refeicao: false,
      tem_vale_alimentacao: false,
      tem_vale_transporte: false,
      tem_day_off: false,
      tem_seguro_vida: false,
      tem_home_office: false,
      tem_auxilio_creche: false,
      tem_participacao_lucros: false,
      tipo_contratacao: null,
      beneficios_encontrados: []
    };

    // Comissão
    if (/comiss[aã]o|comissionamento|comissionado|comissionista/.test(descLower)) {
      info.tem_comissao = true;
      info.beneficios_encontrados.push('Comissão');
    }

    // Bônus
    if (/bônus|bonus/.test(descLower)) {
      info.tem_bonus = true;
      info.beneficios_encontrados.push('Bônus');
    }

    // Gratificação
    if (/gratifica[cç][aã]o|gratificante/.test(descLower)) {
      info.tem_gratificacao = true;
      info.beneficios_encontrados.push('Gratificação');
    }

    // Bonificação
    if (/bonifica[cç][aã]o|bonificado/.test(descLower)) {
      info.tem_bonificacao = true;
      info.beneficios_encontrados.push('Bonificação');
    }

    // Premiação
    if (/premia[cç][aã]o|premiado|pr[eê]mio/.test(descLower)) {
      info.tem_premiacao = true;
      info.beneficios_encontrados.push('Premiação');
    }

    // Participação nos lucros
    if (/participa[cç][aã]o nos lucros|plr|participa[cç][aã]o de resultados/.test(descLower)) {
      info.tem_participacao_lucros = true;
      info.beneficios_encontrados.push('Participação nos Lucros');
    }

    // Plano de saúde
    if (/plano de sa[uú]de|plano m[eé]dico|unimed|sa[uú]de|amil|bradesco sa[uú]de/.test(descLower)) {
      info.tem_plano_saude = true;
      info.beneficios_encontrados.push('Plano de Saúde');
    }

    // Plano odontológico
    if (/plano odontol[oó]gico|odonto|uniodonto|plano d[eê] dentes/.test(descLower)) {
      info.tem_plano_odonto = true;
      info.beneficios_encontrados.push('Plano Odontológico');
    }

    // Vale refeição
    if (/vale[- ]?refei[cç][aã]o|vr\b|ticket refei[cç][aã]o/.test(descLower)) {
      info.tem_vale_refeicao = true;
      info.beneficios_encontrados.push('Vale Refeição');
    }

    // Vale alimentação
    if (/vale[- ]?alimenta[cç][aã]o|va\b|ticket alimenta[cç][aã]o/.test(descLower)) {
      info.tem_vale_alimentacao = true;
      info.beneficios_encontrados.push('Vale Alimentação');
    }

    // Vale transporte
    if (/vale[- ]?transporte|vt\b|transporte|aux[ií]lio[- ]?transporte/.test(descLower)) {
      info.tem_vale_transporte = true;
      info.beneficios_encontrados.push('Vale Transporte');
    }

    // Day off
    if (/day[- ]?off|folga no anivers[aá]rio|anivers[aá]rio/.test(descLower)) {
      info.tem_day_off = true;
      info.beneficios_encontrados.push('Day Off Aniversário');
    }

    // Seguro de vida
    if (/seguro de vida|seguro/.test(descLower)) {
      info.tem_seguro_vida = true;
      info.beneficios_encontrados.push('Seguro de Vida');
    }

    // Home office
    if (/home[- ]?office|remoto|trabalho remoto|teletrabalho/.test(descLower)) {
      info.tem_home_office = true;
      info.beneficios_encontrados.push('Home Office');
    }

    // Auxílio creche
    if (/aux[ií]lio[- ]?creche|creche/.test(descLower)) {
      info.tem_auxilio_creche = true;
      info.beneficios_encontrados.push('Auxílio Creche');
    }

    // Salário mencionado
    if (/sal[aá]rio|R\$|remunera[cç][aã]o|remunerado/.test(descLower)) {
      info.tem_salario = true;
    }

    // Tipo de contratação: CLT ou PJ
    const temClt = /\bclt\b|consolida[cç][aã]o das leis do trabalho|regime clt|contrata[cç][aã]o\s*clt/.test(descLower);
    const temPj = /\bpj\b|pessoa jur[ií]dica|regime pj|contrata[cç][aã]o\s*pj|\bmei\b/.test(descLower);
    if (temClt && temPj) {
      info.tipo_contratacao = 'CLT ou PJ';
    } else if (temClt) {
      info.tipo_contratacao = 'CLT';
    } else if (temPj) {
      info.tipo_contratacao = 'PJ';
    } else {
      info.tipo_contratacao = null;
    }

    // Total pass
    if (/total pass|gympass|wellhub|benefício flex[ií]vel/.test(descLower)) {
      info.beneficios_encontrados.push('Total Pass/Gympass');
    }

    // Plano de saúde (Unimed)
    if (/unimed/.test(descLower)) {
      info.beneficios_encontrados.push('Unimed');
    }

    return info;
  }

  function analisarMatch(jobData) {
    const detalhes = [];
    let pontos = 0;
    let total = 0;

    const tituloLower = jobData.titulo.toLowerCase();
    const descLower = jobData.descricao.toLowerCase();
    const empresaLower = jobData.empresa.toLowerCase();
    const localLower = jobData.local.toLowerCase();

    // Extrair info de salário e benefícios
    const salaryInfo = extractSalaryInfo(descLower);
    jobData.salaryInfo = salaryInfo;

    // Empresa bloqueada
    const empresaBloq = USER_CONFIG.empresas_bloqueadas.some(e => empresaLower.includes(e));
    if (empresaBloq) {
      detalhes.push({ tipo: 'fail', texto: '<strong>Empresa bloqueada</strong>' });
      return { score: 0, detalhes, bloqueado: true };
    }

    // Agência de marketing
    if (USER_CONFIG.agencia_marketing_bloqueada) {
      const agg = USER_CONFIG.agencia_marketing_termos.some(t => empresaLower.includes(t) || tituloLower.includes(t));
      if (agg) {
        detalhes.push({ tipo: 'fail', texto: '<strong>Agência de marketing</strong> (bloqueada)' });
        return { score: 0, detalhes, bloqueado: true };
      }
    }

    // Bairros bloqueados
    const bairroBloq = USER_CONFIG.bairros_bloqueados.some(b => localLower.includes(b.toLowerCase()));
    if (bairroBloq) {
      detalhes.push({ tipo: 'fail', texto: '<strong>Bairro bloqueado</strong>' });
      return { score: 0, detalhes, bloqueado: true };
    }

    // Localização
    total++;
    const localOk = USER_CONFIG.cidades.some(c => localLower.includes(c.toLowerCase()));
    if (localOk) {
      pontos++;
      detalhes.push({ tipo: 'ok', texto: '<strong>Localização:</strong> Goiânia/AG ✓' });
    } else if (localLower.includes('remoto') || localLower.includes('home office') || localLower.includes('hybrid')) {
      pontos += 0.5;
      detalhes.push({ tipo: 'ok', texto: '<strong>Localização:</strong> Remoto/Home Office' });
    } else {
      detalhes.push({ tipo: 'warn', texto: `<strong>Localização:</strong> ${jobData.local || 'Não informada'}` });
    }

    // Tipo de contratação (CLT/PJ) — informativo, não conta pra pontuação
    if (salaryInfo.tipo_contratacao) {
      detalhes.push({ tipo: 'warn', texto: `<strong>Contratação:</strong> ${salaryInfo.tipo_contratacao}` });
    }

    // Comissão / Bônus / Benefícios
    total++;
    const temComissaoBonus = salaryInfo.tem_comissao || salaryInfo.tem_bonus || salaryInfo.tem_gratificacao || salaryInfo.tem_bonificacao || salaryInfo.tem_premiacao || salaryInfo.tem_participacao_lucros;
    if (temComissaoBonus) {
      pontos++;
      const lista = salaryInfo.beneficios_encontrados.join(', ');
      detalhes.push({ tipo: 'ok', texto: `<strong>Remuneração Extra:</strong> ${lista} ✓` });
    } else {
      detalhes.push({ tipo: 'warn', texto: '<strong>Remuneração Extra:</strong> Não encontrada' });
    }

    // Benefícios
    total++;
    const temBeneficios = salaryInfo.tem_plano_saude || salaryInfo.tem_plano_odonto || salaryInfo.tem_vale_refeicao || salaryInfo.tem_vale_alimentacao || salaryInfo.tem_day_off || salaryInfo.tem_seguro_vida;
    if (temBeneficios) {
      pontos++;
      const benList = [];
      if (salaryInfo.tem_plano_saude) benList.push('Saúde');
      if (salaryInfo.tem_plano_odonto) benList.push('Odonto');
      if (salaryInfo.tem_vale_refeicao) benList.push('VR');
      if (salaryInfo.tem_vale_alimentacao) benList.push('VA');
      if (salaryInfo.tem_day_off) benList.push('Day Off');
      if (salaryInfo.tem_seguro_vida) benList.push('Seguro');
      detalhes.push({ tipo: 'ok', texto: `<strong>Benefícios:</strong> ${benList.join(', ')} ✓` });
    } else {
      detalhes.push({ tipo: 'warn', texto: '<strong>Benefícios:</strong> Não encontrados' });
    }

    // Cargo - verificar se algum termo do cargo está na lista de foco
    total++;
    const cargoTermos = tituloLower.split(/\s+/);
    const cargoFoco = USER_CONFIG.cargos_foco.some(c => {
      const cLower = c.toLowerCase();
      return tituloLower.includes(cLower) ||
             cargoTermos.some(t => cLower.includes(t) && t.length > 3);
    });
    if (cargoFoco) {
      pontos++;
      detalhes.push({ tipo: 'ok', texto: '<strong>Cargo:</strong> Compatível com foco ✓' });
    } else {
      detalhes.push({ tipo: 'warn', texto: '<strong>Cargo:</strong> Não está na lista de foco' });
    }

    // Setor
    total++;
    const setorOk = USER_CONFIG.setores_preferidos.some(s => descLower.includes(s.toLowerCase()) || tituloLower.includes(s.toLowerCase()));
    const setorEvitado = USER_CONFIG.setores_evitados.some(s => descLower.includes(s.toLowerCase()) || tituloLower.includes(s.toLowerCase()));
    if (setorOk) {
      pontos++;
      detalhes.push({ tipo: 'ok', texto: '<strong>Setor:</strong> Preferido ✓' });
    } else if (setorEvitado) {
      detalhes.push({ tipo: 'fail', texto: '<strong>Setor:</strong> Evitado ✗' });
    } else {
      detalhes.push({ tipo: 'warn', texto: '<strong>Setor:</strong> Neutro' });
    }

    // Competências
    total++;
    const compMatch = USER_CONFIG.competencias.filter(c => descLower.includes(c.toLowerCase()));
    if (compMatch.length >= 3) {
      pontos++;
      detalhes.push({ tipo: 'ok', texto: `<strong>Competências:</strong> ${compMatch.length} compatíveis ✓` });
    } else if (compMatch.length > 0) {
      pontos += 0.5;
      detalhes.push({ tipo: 'warn', texto: `<strong>Competências:</strong> ${compMatch.length} compatível(is)` });
    } else {
      detalhes.push({ tipo: 'fail', texto: '<strong>Competências:</strong> Nenhuma detectada' });
    }

    // Área
    total++;
    const areaOk = USER_CONFIG.areas.some(a => descLower.includes(a.toLowerCase()) || tituloLower.includes(a.toLowerCase()));
    if (areaOk) {
      pontos++;
      detalhes.push({ tipo: 'ok', texto: '<strong>Área:</strong> Compatível ✓' });
    } else {
      detalhes.push({ tipo: 'warn', texto: '<strong>Área:</strong> Não identificada' });
    }

    // Descrição encontrada?
    total++;
    if (jobData.descricao && jobData.descricao.length > 100) {
      pontos++;
      detalhes.push({ tipo: 'ok', texto: `<strong>Descrição:</strong> ${jobData.descricao.length} chars ✓` });
    } else {
      detalhes.push({ tipo: 'warn', texto: '<strong>Descrição:</strong> Pouco detalhe' });
    }

    const score = Math.round((pontos / total) * 100);
    return { score, detalhes, bloqueado: false };
  }

  // Nome completo → selinho curto (pra caber lado a lado: VR / VA / VT ...)
  const BENEFICIO_CURTO = {
    'Plano de Saúde': 'Saúde',
    'Plano Odontológico': 'Odonto',
    'Vale Refeição': 'VR',
    'Vale Alimentação': 'VA',
    'Vale Transporte': 'VT',
    'Day Off Aniversário': 'Day Off',
    'Seguro de Vida': 'Seguro',
    'Home Office': 'Home Office',
    'Auxílio Creche': 'Creche',
    'Total Pass/Gympass': 'Gympass',
    'Unimed': 'Unimed'
  };

  // Itens de remuneração extra (comissão/bônus/etc.) — selinho separado dos benefícios
  const EXTRA_REMUNERACAO = ['Comissão', 'Bônus', 'Gratificação', 'Bonificação', 'Premiação', 'Participação nos Lucros'];

  function buildChipsHtml(items, chipClass) {
    return items.map(i => `<span class="vm-chip ${chipClass}">${i}</span>`).join('');
  }

  function renderResult(result) {
    const scoreEl = document.getElementById('vm-score');
    const circleEl = document.getElementById('vm-score-circle');
    const detailsEl = document.getElementById('vm-details');
    const statusEl = document.getElementById('vm-status');

    if (result.bloqueado) {
      scoreEl.textContent = '0';
      circleEl.style.setProperty('--score-color', '#e94560');
      circleEl.style.setProperty('--score-pct', '0%');
      statusEl.textContent = 'VAGA BLOQUEADA';
      statusEl.style.color = '#e94560';
    } else {
      scoreEl.textContent = result.score;
      let color = '#e94560';
      if (result.score >= 70) color = '#3b82f6';
      else if (result.score >= 40) color = '#ffc107';
      circleEl.style.setProperty('--score-color', color);
      circleEl.style.setProperty('--score-pct', `${result.score}%`);

      if (result.score >= 70) {
        statusEl.textContent = 'BOM MATCH - Vale aplicar!';
        statusEl.style.color = '#3b82f6';
      } else if (result.score >= 40) {
        statusEl.textContent = 'MATCH PARCIAL - Verificar detalhes';
        statusEl.style.color = '#ffc107';
      } else {
        statusEl.textContent = 'BAIXO MATCH - Provavelmente não compensa';
        statusEl.style.color = '#e94560';
      }
    }

    // Adicionar info do job se disponível
    let jobInfoHtml = '';
    if (result.jobData) {
      const jd = result.jobData;
      const si = jd.salaryInfo || {};

      const logoHtml = jd.logo
        ? `<img src="${jd.logo}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:10px;" onerror="this.style.display='none'">`
        : '';

      const todosBeneficios = si.beneficios_encontrados || [];

      // Separa remuneração extra (comissão/bônus/...) dos benefícios (VR/VA/VT/...)
      const extrasEncontrados = todosBeneficios.filter(b => EXTRA_REMUNERACAO.includes(b));
      const beneficiosEncontrados = todosBeneficios.filter(b => !EXTRA_REMUNERACAO.includes(b))
        .map(b => BENEFICIO_CURTO[b] || b);

      const extrasChipsHtml = extrasEncontrados.length > 0
        ? `<div class="chips-label">Remuneração extra</div><div class="chips-row">${buildChipsHtml(extrasEncontrados, 'vm-chip-extra')}</div>`
        : '';

      const beneficiosChipsHtml = beneficiosEncontrados.length > 0
        ? `<div class="chips-label">Benefícios</div><div class="chips-row">${buildChipsHtml(beneficiosEncontrados, 'vm-chip-ok')}</div>`
        : '';

      const semNadaHtml = (extrasEncontrados.length === 0 && beneficiosEncontrados.length === 0)
        ? `<div class="match-item" style="background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.2);">
            <div class="icon fail">💰</div>
            <div class="text"><strong>Sem benefícios/extras detectados</strong></div>
           </div>`
        : '';

      // Modalidade de contratação: CLT (bom) / CLT ou PJ (neutro) / PJ sozinho (alerta)
      let modalidadeChipHtml = '';
      if (si.tipo_contratacao) {
        let chipClass = 'vm-chip-warn';
        if (si.tipo_contratacao === 'CLT') chipClass = 'vm-chip-ok';
        else if (si.tipo_contratacao === 'PJ') chipClass = 'vm-chip-fail';
        modalidadeChipHtml = `<div class="chips-row" style="margin-top:8px;">${buildChipsHtml([si.tipo_contratacao], chipClass)}</div>`;
      }

      jobInfoHtml = `
        <div class="match-item" style="background:rgba(0,212,170,0.1);border:1px solid rgba(0,212,170,0.2);">
          <div class="icon ok">📋</div>
          <div class="text" style="display:flex;align-items:center;">
            ${logoHtml}
            <div><strong>${jd.titulo || 'Vaga'}</strong><br><small>${jd.empresa || ''} · ${jd.local || ''}</small></div>
          </div>
        </div>
        ${jd.modalidade ? `<div class="match-item"><div class="icon ok">🏢</div><div class="text"><strong>Modalidade:</strong> ${jd.modalidade}</div></div>` : ''}
        ${modalidadeChipHtml}
        ${extrasChipsHtml}
        ${beneficiosChipsHtml}
        ${semNadaHtml}
      `;
    }

    // Badge NAO mostra os campos de detalhe da analise (Descrição/Área/Competências/etc).
    // Exibido apenas o resumo do job (titulo/empresa/modalidade/beneficios), se houver.
    detailsEl.innerHTML = jobInfoHtml;
  }

  // =============================================
  // PÁGINA DE VAGA DIRETA (não busca)
  // =============================================
  async function initJobPage() {
    await loadUserConfig();

    function analisar() {
      const jobData = extractJobData();
      if (!jobData.titulo) return false;
      const result = analisarMatch(jobData);
      result.jobData = jobData;
      renderResult(result);
      try { chrome.runtime.sendMessage({ type: 'JOB_DATA', data: jobData, result }); } catch(e) {}
      return true;
    }

    const statusEl = document.getElementById('vm-status');

    // REGRA MESTRE: na pagina individual, ENQUANTO o botao "ver mais" existir,
    // clica para expandir tudo; QUANDO o botao some (descricao toda aberta) OU
    // apos N tentativas, faz a analise. Se nunca houve botao, analisa com o que tem.
    let tentativas = 0;
    const verificador = setInterval(() => {
      tentativas++;
      if (temBotaoVerMais()) {
        if (statusEl) statusEl.textContent = 'Ativando descrição...';
        expandirDescricao();                       // clica ate o botao sumir
        if (tentativas >= 20) {                    // desiste de esperar: analisa parcial
          clearInterval(verificador);
          analisar();
        }
      } else {
        clearInterval(verificador);                // botao sumiu ou nunca existiu
        analisar();
      }
    }, 1200);

    // analise imediata se ja nao houver botao de expansao
    if (!temBotaoVerMais()) analisar();

    // re-analisa se o painel mudar (mutacoes no conteudo)
    const observer = new MutationObserver(() => analisar());
    const mainTarget = document.querySelector('main') || document.body;
    observer.observe(mainTarget, { childList: true, subtree: true });
  }

  // =============================================
  // INICIALIZAÇÃO
  // =============================================

  const isOnViewPage = location.href.includes('/jobs/view/');

  if (isSearchPage() && !isOnViewPage) {
    // Carregar config e depois inicializar
    loadUserConfig().then(() => {
      // Processar mini badges com múltiplos delays
      processSearchPage();
      setTimeout(processSearchPage, 1000);
      setTimeout(processSearchPage, 2000);
      setTimeout(processSearchPage, 3000);
      setTimeout(processSearchPage, 5000);
      setTimeout(processSearchPage, 8000);
      setTimeout(processSearchPage, 12000);

      startObserver();
      monitorUrlChanges();

      // Re-processar ao scrollar (pega cards virtualizados)
      let scrollTimer = null;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(processSearchPage, 300);
      }, { passive: true });

      // ANALISAR DETALHE IMEDIATAMENTE (painel já visível)
      const initialJobId = getCurrentJobIdFromUrl();
      if (initialJobId) {
        lastJobId = initialJobId;
      }
      // Analisar agora + delays progressivos
      setTimeout(analyzeCurrentDetail, 300);
      setTimeout(analyzeCurrentDetail, 800);
      setTimeout(analyzeCurrentDetail, 1500);
      setTimeout(analyzeCurrentDetail, 2500);
      setTimeout(analyzeCurrentDetail, 4000);
      setTimeout(analyzeCurrentDetail, 6000);
      setTimeout(() => { analyzeCurrentDetail(); watchDetailPanel(); }, 300);
    });
  } else {
    // Página de vaga direta (/jobs/view/) — análise DESLIGADA por decisão do usuário:
    // a extensão só analisa na visão agregadora (busca com lista de vagas).
    // Remove o badge (se veio da agregadora via SPA) para mantê-lo OCULTO aqui.
    const badgeInd = document.getElementById('vagas-match-badge');
    if (badgeInd) badgeInd.remove();
  }
})();
