'use strict';

const { MetricsCollector } = require('./metrics-collector');

/**
 * Gera dados simulados realistas de execuções de Quality Gates.
 * Os dados incluem timesteps decrescentes, variações de taxa de aprovação
 * e findings aleatórios para camadas, CodeRabbit e Quinn.
 * 
 * @param {Object} options
 * @param {number} options.days - Quantidade de dias no passado a simular
 * @param {number} options.runsPerDay - Média de runs por dia
 * @param {boolean} options.weekendReduction - Reduzir atividade nos finais de semana
 * @returns {Object} Estrutura de métricas populada e recalculada
 */
function generateSeedData(options = {}) {
  const days = options.days || 30;
  const runsPerDay = options.runsPerDay || 8;
  const weekendReduction = options.weekendReduction !== false;

  const collector = new MetricsCollector({ retentionDays: days });
  const metrics = collector._getInitialMetrics();

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const history = [];

  const stories = ['STORY-001', 'STORY-002', 'STORY-1.8', 'STORY-3.11a', 'STORY-3.12'];
  const branches = ['feat/social-platforms', 'fix/e2e-selectors', 'feat/metrics-collector', 'refactor/security-tests'];
  const categories = ['style', 'security', 'complexity', 'docs', 'tests', 'performance', 'imports'];

  // Percorre do dia mais antigo até hoje para criar a linha do tempo cronológica
  for (let i = days; i >= 0; i--) {
    const dayTimestamp = now - i * oneDayMs;
    const dayDate = new Date(dayTimestamp);
    const dayOfWeek = dayDate.getDay(); // 0 = Domingo, 6 = Sábado
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Finais de semana reduzem drasticamente as execuções para simular um fluxo real de trabalho
    let runsCount = Math.max(1, Math.round(runsPerDay + (Math.random() * 4 - 2)));
    if (isWeekend && weekendReduction) {
      runsCount = Math.random() > 0.7 ? 1 : 0;
    }

    const dayRuns = [];
    for (let r = 0; r < runsCount; r++) {
      // Horários comerciais típicos (9h às 19h)
      const hour = isWeekend ? Math.floor(10 + Math.random() * 6) : Math.floor(9 + Math.random() * 10);
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      
      const runDate = new Date(dayDate);
      runDate.setHours(hour, minute, second);

      // Probabilidades de cada camada na esteira: L1 = 70%, L2 = 20%, L3 = 10%
      const rand = Math.random();
      let layer = 1;
      if (rand > 0.9) {
        layer = 3;
      } else if (rand > 0.7) {
        layer = 2;
      }

      let passed = true;
      let durationMs = 0;
      let findingsCount = 0;
      let coderabbit = null;
      let quinn = null;

      const story = stories[Math.floor(Math.random() * stories.length)];
      const branch = branches[Math.floor(Math.random() * branches.length)];
      const commit = Math.random().toString(16).substring(2, 10);

      // Simulação realista das pass rates e dados específicos de cada camada
      if (layer === 1) {
        passed = Math.random() > 0.15; // 85% pass rate
        durationMs = Math.floor(500 + Math.random() * 2500);
        findingsCount = passed ? 0 : Math.floor(1 + Math.random() * 3);
      } else if (layer === 2) {
        passed = Math.random() > 0.20; // 80% pass rate
        durationMs = Math.floor(12000 + Math.random() * 30000);
        findingsCount = passed ? 0 : Math.floor(1 + Math.random() * 5);

        // Simula achados adicionais do CodeRabbit de vez em quando
        if (Math.random() > 0.3) {
          const critical = passed ? 0 : (Math.random() > 0.95 ? 1 : 0);
          const high = passed ? 0 : Math.floor(Math.random() * 2);
          const medium = passed ? 0 : Math.floor(Math.random() * 3);
          const low = Math.floor(Math.random() * 4); // Baixo impacto pode ocorrer em builds aprovados

          coderabbit = {
            findingsCount: critical + high + medium + low,
            severityBreakdown: { critical, high, medium, low }
          };
        }

        // Simula achados adicionais do Quinn
        if (Math.random() > 0.2) {
          const qFindings = passed ? 0 : Math.floor(1 + Math.random() * 3);
          const qCats = [];
          if (qFindings > 0) {
            const catCount = Math.floor(1 + Math.random() * 2);
            for (let c = 0; c < catCount; c++) {
              const cat = categories[Math.floor(Math.random() * categories.length)];
              if (!qCats.includes(cat)) qCats.push(cat);
            }
          }
          quinn = {
            findingsCount: qFindings,
            topCategories: qCats
          };
        }
      } else {
        passed = Math.random() > 0.10; // 90% pass rate
        durationMs = Math.floor(300000 + Math.random() * 1500000);
        findingsCount = passed ? 0 : Math.floor(1 + Math.random() * 2);
      }

      dayRuns.push({
        timestamp: runDate.toISOString(),
        layer,
        passed,
        durationMs,
        findingsCount,
        metadata: {
          storyId: story,
          branchName: branch,
          commitHash: commit,
          triggeredBy: 'cli-seed'
        },
        coderabbit,
        quinn
      });
    }

    // Ordenação do dia para evitar drifts de timestamp
    dayRuns.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    history.push(...dayRuns);
  }

  // Ordenação global da linha do tempo
  history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  metrics.history = history;

  // Executa recálculo para gerar tendências corretas nos agregados
  collector._recalculate(metrics);

  return metrics;
}

/**
 * Gera e persiste os dados simulados no arquivo de dados do AIOX.
 * 
 * @param {Object} options - Parâmetros do seed
 * @returns {Promise<Object>} Estrutura gravada
 */
async function seedMetrics(options = {}) {
  const metrics = generateSeedData(options);
  const collector = new MetricsCollector({ retentionDays: options.days });
  await collector._saveMetrics(metrics);
  return metrics;
}

module.exports = {
  generateSeedData,
  seedMetrics
};
