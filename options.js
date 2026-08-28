(() => {
  // Dados padrão vindos do config.js (PERFIL)
  const DEFAULTS = {
    areas: [...PERFIL.areas],
    cargos_foco: [...PERFIL.cargos_foco],
    setores_preferidos: [...PERFIL.setores_preferidos],
    setores_evitados: [...PERFIL.setores_evitados],
    competencias: [...PERFIL.competencias],
    cidades: [...PERFIL.cidades],
    empresas_bloqueadas: [...PERFIL.empresas_bloqueadas],
    bairros_bloqueados: [...PERFIL.bairros_bloqueados],
    agencia_marketing_bloqueada: PERFIL.agencia_marketing_bloqueada,
    salario_minimo: PERFIL.salario_minimo || 2600,
    dias_maximos: REGRAS.dias_maximos_vaga || 7,
    remuneracao_extra: ['Comissão', 'Bônus', 'Gratificação', 'Bonificação', 'Premiação', 'Participação nos Lucros'],
    beneficios_desejados: ['Plano de Saúde', 'Plano Odontológico', 'Vale Refeição', 'Vale Alimentação', 'Vale Transporte', 'Day Off Aniversário', 'Seguro de Vida', 'Total Pass/Gympass']
  };

  let config = {};

  // Chaves que aceitam itens personalizados (adicionados/removidos livremente pelo usuário)
  const CUSTOM_KEYS = ['areas', 'cargos_foco', 'setores_preferidos', 'setores_evitados',
    'competencias', 'cidades', 'empresas_bloqueadas', 'bairros_bloqueados',
    'remuneracao_extra', 'beneficios_desejados'];

  function loadConfig() {
    return new Promise(resolve => {
      chrome.storage.local.get('vagasMatchConfig', (data) => {
        if (data.vagasMatchConfig) {
          config = { ...DEFAULTS, ...data.vagasMatchConfig };
        } else {
          config = { ...DEFAULTS };
        }
        // custom_items: itens extras (fora dos padrões) que o usuário criou por seção
        if (!config.custom_items) config.custom_items = {};
        CUSTOM_KEYS.forEach(k => {
          if (!Array.isArray(config.custom_items[k])) config.custom_items[k] = [];
        });
        resolve(config);
      });
    });
  }

  function saveConfig() {
    chrome.storage.local.set({ vagasMatchConfig: config }, () => {
      const msg = document.getElementById('saved-msg');
      msg.style.display = 'block';
      msg.style.animation = 'none';
      msg.offsetHeight;
      msg.style.animation = 'fadeInOut 2s forwards';
      setTimeout(() => msg.style.display = 'none', 2100);
    });
  }

  function buildToggle(containerId, configKey, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    let onCount = 0;

    const isCustomKey = CUSTOM_KEYS.includes(configKey);
    const customList = isCustomKey ? (config.custom_items[configKey] || []) : [];
    const todosItens = isCustomKey ? [...items, ...customList] : items;

    todosItens.forEach(item => {
      const isCustom = customList.includes(item);
      const isOn = config[configKey].includes(item);
      if (isOn) onCount++;

      const div = document.createElement('div');
      div.className = `toggle-item ${isOn ? 'on' : 'off'}`;
      div.innerHTML = `
        <div class="toggle-switch"></div>
        <span class="toggle-label">${item}</span>
        ${isCustom ? '<button type="button" class="toggle-remove" title="Remover">×</button>' : ''}
      `;
      div.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('toggle-remove')) return; // tratado abaixo
        const arr = config[configKey];
        const idx = arr.indexOf(item);
        if (idx >= 0) {
          arr.splice(idx, 1);
          div.className = 'toggle-item off';
        } else {
          arr.push(item);
          div.className = 'toggle-item on';
        }
        updateStats();
      });

      const removeBtn = div.querySelector('.toggle-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const custIdx = config.custom_items[configKey].indexOf(item);
          if (custIdx >= 0) config.custom_items[configKey].splice(custIdx, 1);
          const activeIdx = config[configKey].indexOf(item);
          if (activeIdx >= 0) config[configKey].splice(activeIdx, 1);
          div.remove();
          updateStats();
        });
      }

      container.appendChild(div);
    });

    // Linha "adicionar item" para chaves que aceitam personalização
    if (isCustomKey) {
      const addRow = document.createElement('div');
      addRow.className = 'add-item-row';
      addRow.style.gridColumn = '1 / -1';
      addRow.innerHTML = `
        <input type="text" placeholder="Adicionar item novo (ex: outro bairro, empresa, cidade...)">
        <button type="button" class="btn-add">+ Adicionar</button>
      `;
      const input = addRow.querySelector('input');
      const btn = addRow.querySelector('button');

      const addItem = () => {
        const val = input.value.trim();
        if (!val) return;
        const jaExiste = todosItens.some(i => i.toLowerCase() === val.toLowerCase());
        if (jaExiste) { input.value = ''; return; }
        config.custom_items[configKey].push(val);
        config[configKey].push(val); // já entra ativo
        input.value = '';
        buildToggle(containerId, configKey, items);
        updateStats();
      };

      btn.addEventListener('click', addItem);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); addItem(); }
      });

      container.appendChild(addRow);
    }

    return { total: todosItens.length, on: onCount };
  }

  function buildRegras() {
    const container = document.getElementById('grid-regras');
    container.innerHTML = '';

    const regras = [
      { key: 'agencia_marketing_bloqueada', label: 'Bloquear agências de marketing' }
    ];

    regras.forEach(r => {
      const isOn = config[r.key];
      const div = document.createElement('div');
      div.className = `toggle-item ${isOn ? 'on' : 'off'}`;
      div.innerHTML = `
        <div class="toggle-switch"></div>
        <span class="toggle-label">${r.label}</span>
      `;
      div.addEventListener('click', () => {
        config[r.key] = !config[r.key];
        div.className = `toggle-item ${config[r.key] ? 'on' : 'off'}`;
      });
      container.appendChild(div);
    });
  }

  function updateStats() {
    const allKeys = ['areas', 'cargos_foco', 'setores_preferidos', 'setores_evitados', 'competencias', 'cidades', 'empresas_bloqueadas', 'bairros_bloqueados'];
    let totalOn = 0, totalOff = 0, totalAll = 0;

    allKeys.forEach(k => {
      const totalItens = (DEFAULTS[k] || []).length + (config.custom_items?.[k]?.length || 0);
      const on = config[k].length;
      const off = totalItens - on;
      totalOn += on;
      totalOff += Math.max(0, off);
      totalAll += totalItens;
    });

    document.getElementById('stat-on').textContent = totalOn;
    document.getElementById('stat-off').textContent = totalOff;
    document.getElementById('stat-total').textContent = totalAll;
  }

  async function init() {
    await loadConfig();

    buildToggle('grid-areas', 'areas', DEFAULTS.areas);
    buildToggle('grid-cargos', 'cargos_foco', DEFAULTS.cargos_foco);
    buildToggle('grid-setores-pref', 'setores_preferidos', DEFAULTS.setores_preferidos);
    buildToggle('grid-setores-evit', 'setores_evitados', DEFAULTS.setores_evitados);
    buildToggle('grid-competencias', 'competencias', DEFAULTS.competencias);
    buildToggle('grid-cidades', 'cidades', DEFAULTS.cidades);
    buildToggle('grid-empresas', 'empresas_bloqueadas', DEFAULTS.empresas_bloqueadas);
    buildToggle('grid-bairros', 'bairros_bloqueados', DEFAULTS.bairros_bloqueados);
    buildToggle('grid-remuneracao', 'remuneracao_extra', DEFAULTS.remuneracao_extra);
    buildToggle('grid-beneficios', 'beneficios_desejados', DEFAULTS.beneficios_desejados);
    buildRegras();

    document.getElementById('input-salario').value = config.salario_minimo;
    document.getElementById('input-dias').value = config.dias_maximos;

    updateStats();

    document.getElementById('btn-save').addEventListener('click', () => {
      config.salario_minimo = parseInt(document.getElementById('input-salario').value) || 2600;
      config.dias_maximos = parseInt(document.getElementById('input-dias').value) || 7;
      saveConfig();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Restaurar todas as configurações padrão?')) {
        config = { ...DEFAULTS };
        chrome.storage.local.remove('vagasMatchConfig', () => {
          init();
          saveConfig();
        });
      }
    });
  }

  init();
})();
