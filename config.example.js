// ============================================================================
// EXEMPLO de configuração (SEM dados pessoais).
// Copie este arquivo para `config.js` e preencha com SEUS dados.
// O arquivo `config.js` REAL é ignorado pelo .gitignore (não deve ser compartilhado).
// ============================================================================

const PERFIL = {
  nome: "SEU_NOME",
  titulo: "Sua Profissão | Cargo",
  nivel: "Júnior",
  pretensao_salarial: 0,          // ex.: 3000
  salario_minimo: 0,              // ex.: 2600
  cidades: ["Sua Cidade", "Sua Cidade 2"],
  areas: ["Comercial", "Vendas", "Tecnologia"],
  setores_preferidos: ["Tecnologia", "Software", "SaaS"],
  setores_evitados: ["Setor X", "Setor Y"],
  agencia_marketing_bloqueada: true,
  agencia_marketing_termos: ["agência de marketing", "agencia de marketing"],
  bairros_bloqueados: [],          // ex.: ["Bairro X"]
  empresas_bloqueadas: [],         // ex.: ["empresa_x", "empresa_y"]
  cargos_foco: [
    "Assistente Comercial", "SDR", "BDR", "Vendedor Interno", "Inside Sales"
  ],
  competencias: [
    "CRM", "Vendas B2B", "Negociação", "Comunicação"
  ],
  idiomas: {
    "Português": "nativo",
    "Inglês": "intermediário"
  },
  linkedin: "https://www.linkedin.com/in/SEU-PERFIL/"
};

const REGRAS = {
  dias_maximos_vaga: 7,
  regra_salario: "fixo acima do mínimo aceita. Menos: só se tiver comissão/gratificação/bonificação"
};
