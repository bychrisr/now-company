'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Classe responsável por coletar, gerenciar e persistir as métricas das Quality Gates.
 * Mantém o histórico das execuções e calcula os agregados por camada e tendências temporais.
 */
class MetricsCollector {
  /**
   * @param {Object} [options]
   * @param {number} [options.retentionDays=30] - Período de retenção em dias para expurgar dados antigos
   */
  constructor(options = {}) {
    this.retentionDays = options.retentionDays || 30;
    // O diretório padrão de dados do AIOX fica em .aiox/data na raiz do projeto
    this.metricsDir = path.join(process.cwd(), '.aiox', 'data');
    this.metricsFile = path.join(this.metricsDir, 'quality-metrics.json');
  }

  /**
   * Retorna a estrutura inicial vazia para o arquivo de métricas.
   * Feito assim para garantir que as propriedades obrigatórias sempre existam e evitem erros de runtime.
   * @private
   */
  _getInitialMetrics() {
    return {
      lastUpdated: null,
      retentionDays: this.retentionDays,
      history: [],
      layers: {
        layer1: { totalRuns: 0, passRate: 0, avgTimeMs: 0, lastRun: null },
        layer2: {
          totalRuns: 0,
          passRate: 0,
          avgTimeMs: 0,
          lastRun: null,
          autoCatchRate: 0,
          coderabbit: { active: false, findingsCount: 0, severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
          quinn: { findingsCount: 0, topCategories: [] }
        },
        layer3: { totalRuns: 0, passRate: 0, avgTimeMs: 0, lastRun: null }
      },
      trends: {
        passRates: [],
        autoCatchRate: []
      }
    };
  }

  /**
   * Garante a existência do diretório e lê as métricas do arquivo.
   * Se o arquivo não existir ou for inválido, inicializa-o com a estrutura padrão.
   * @returns {Promise<Object>}
   */
  async getMetrics() {
    try {
      await fs.mkdir(this.metricsDir, { recursive: true });
      const content = await fs.readFile(this.metricsFile, 'utf8');
      const data = JSON.parse(content);
      
      // Sincroniza o retentionDays com a configuração atual do construtor
      data.retentionDays = this.retentionDays;
      return data;
    } catch (error) {
      // Retorna a estrutura limpa caso o arquivo ainda não exista ou esteja corrompido
      return this._getInitialMetrics();
    }
  }

  /**
   * Salva o estado atual das métricas no arquivo JSON de forma segura.
   * @param {Object} metrics - Dados de métricas
   * @returns {Promise<void>}
   * @private
   */
  async _saveMetrics(metrics) {
    metrics.lastUpdated = new Date().toISOString();
    await fs.mkdir(this.metricsDir, { recursive: true });
    await fs.writeFile(this.metricsFile, JSON.stringify(metrics, null, 2), 'utf8');
  }

  /**
   * Registra uma execução para as camadas 1 (Pre-commit) ou 3 (Human Review).
   * @param {number} layerNum - Número da camada (1 ou 3)
   * @param {Object} runData - Dados da execução
   * @returns {Promise<Object>} O registro criado
   */
  async recordRun(layerNum, runData) {
    const metrics = await this.getMetrics();

    const run = {
      timestamp: new Date().toISOString(),
      layer: layerNum,
      passed: !!runData.passed,
      durationMs: typeof runData.durationMs === 'number' ? runData.durationMs : 0,
      findingsCount: typeof runData.findingsCount === 'number' ? runData.findingsCount : 0,
      metadata: runData.metadata || {}
    };

    metrics.history.push(run);
    this._recalculate(metrics);
    await this._saveMetrics(metrics);

    return run;
  }

  /**
   * Registra uma execução para a camada 2 (PR Automation), incluindo dados das ferramentas Quinn e CodeRabbit.
   * @param {Object} prReviewData - Dados da automação da PR
   * @returns {Promise<Object>} O registro criado
   */
  async recordPRReview(prReviewData) {
    const metrics = await this.getMetrics();

    const run = {
      timestamp: new Date().toISOString(),
      layer: 2,
      passed: !!prReviewData.passed,
      durationMs: typeof prReviewData.durationMs === 'number' ? prReviewData.durationMs : 0,
      findingsCount: typeof prReviewData.findingsCount === 'number' ? prReviewData.findingsCount : 0,
      metadata: prReviewData.metadata || {},
      coderabbit: prReviewData.coderabbit || null,
      quinn: prReviewData.quinn || null
    };

    metrics.history.push(run);
    this._recalculate(metrics);
    await this._saveMetrics(metrics);

    return run;
  }

  /**
   * Realiza a limpeza de registros mais antigos do que o período de retenção configurado.
   * @returns {Promise<number>} Quantidade de registros removidos
   */
  async cleanup() {
    const metrics = await this.getMetrics();
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const initialCount = metrics.history.length;

    // Filtra o histórico mantendo apenas registros dentro do limite de dias configurado
    metrics.history = metrics.history.filter(
      (run) => new Date(run.timestamp).getTime() > cutoff
    );

    const removedCount = initialCount - metrics.history.length;

    if (removedCount > 0) {
      this._recalculate(metrics);
      await this._saveMetrics(metrics);
    }

    return removedCount;
  }

  /**
   * Exporta o histórico atual para o formato especificado.
   * Atualmente, suporta apenas exportação para CSV.
   * @param {string} format - Formato desejado ('csv')
   * @returns {Promise<string>} String formatada
   */
  async export(format) {
    if (format !== 'csv') {
      throw new Error(`Unsupported export format: ${format}`);
    }

    const metrics = await this.getMetrics();
    const headers = ['timestamp', 'layer', 'passed', 'durationMs', 'findingsCount', 'storyId', 'branchName', 'commitHash'];
    const lines = [headers.join(',')];

    for (const run of metrics.history) {
      const row = [
        run.timestamp,
        run.layer,
        run.passed ? 'true' : 'false',
        run.durationMs,
        run.findingsCount || 0,
        run.metadata.storyId || '',
        run.metadata.branchName || '',
        run.metadata.commitHash || ''
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Recalcula todos os dados agregados e tendências a partir do histórico bruto de execuções.
   * @param {Object} metrics - Objeto de métricas a ser atualizado in-place
   * @private
   */
  _recalculate(metrics) {
    const history = metrics.history;

    // Processa os agregados por camada individualmente (Layer 1, 2 e 3)
    for (let layerNum = 1; layerNum <= 3; layerNum++) {
      const layerKey = `layer${layerNum}`;
      const layerRuns = history.filter((run) => run.layer === layerNum);
      const totalRuns = layerRuns.length;

      if (totalRuns === 0) {
        metrics.layers[layerKey] = this._getInitialMetrics().layers[layerKey];
        continue;
      }

      const passedRuns = layerRuns.filter((run) => run.passed).length;
      const passRate = passedRuns / totalRuns;
      const avgTimeMs = layerRuns.reduce((sum, run) => sum + run.durationMs, 0) / totalRuns;
      
      // Ordena por timestamp para garantir que pegamos o último run de forma confiável
      const sortedRuns = [...layerRuns].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const lastRun = sortedRuns[sortedRuns.length - 1].timestamp;

      metrics.layers[layerKey] = {
        totalRuns,
        passRate,
        avgTimeMs,
        lastRun
      };

      // Adiciona lógicas e estatísticas específicas para a Layer 2
      if (layerNum === 2) {
        // Auto-Catch Rate representa quantos findings foram pegos pelas ferramentas automatizadas (Layer 1 e Layer 2)
        // divididos pelo total geral de findings acumulados em todas as camadas.
        const findingsL1 = history.filter((run) => run.layer === 1).reduce((sum, run) => sum + (run.findingsCount || 0), 0);
        const findingsL2 = layerRuns.reduce((sum, run) => sum + (run.findingsCount || 0), 0);
        const findingsL3 = history.filter((run) => run.layer === 3).reduce((sum, run) => sum + (run.findingsCount || 0), 0);

        const totalFindings = findingsL1 + findingsL2 + findingsL3;
        const autoCatchRate = totalFindings > 0 ? (findingsL1 + findingsL2) / totalFindings : 1.0;

        metrics.layers.layer2.autoCatchRate = autoCatchRate;

        // Agrega os dados do CodeRabbit de todas as execuções da Layer 2 no histórico
        const codeRabbitRuns = layerRuns.filter((run) => !!run.coderabbit);
        const hasCodeRabbit = codeRabbitRuns.length > 0;

        const crFindings = codeRabbitRuns.reduce((sum, run) => sum + (run.coderabbit.findingsCount || 0), 0);
        const crCritical = codeRabbitRuns.reduce((sum, run) => sum + ((run.coderabbit.severityBreakdown && run.coderabbit.severityBreakdown.critical) || 0), 0);
        const crHigh = codeRabbitRuns.reduce((sum, run) => sum + ((run.coderabbit.severityBreakdown && run.coderabbit.severityBreakdown.high) || 0), 0);
        const crMedium = codeRabbitRuns.reduce((sum, run) => sum + ((run.coderabbit.severityBreakdown && run.coderabbit.severityBreakdown.medium) || 0), 0);
        const crLow = codeRabbitRuns.reduce((sum, run) => sum + ((run.coderabbit.severityBreakdown && run.coderabbit.severityBreakdown.low) || 0), 0);

        metrics.layers.layer2.coderabbit = {
          active: hasCodeRabbit,
          findingsCount: crFindings,
          severityBreakdown: {
            critical: crCritical,
            high: crHigh,
            medium: crMedium,
            low: crLow
          }
        };

        // Agrega os dados do Quinn (linter/validador de stories)
        const quinnRuns = layerRuns.filter((run) => !!run.quinn);
        const quinnFindings = quinnRuns.reduce((sum, run) => sum + (run.quinn.findingsCount || 0), 0);
        
        // Coleta e ordena as categorias mais recorrentes encontradas pelo Quinn no histórico
        const categoryCounts = {};
        quinnRuns.forEach((run) => {
          if (run.quinn.topCategories && Array.isArray(run.quinn.topCategories)) {
            run.quinn.topCategories.forEach((cat) => {
              categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            });
          }
        });

        const topCategories = Object.keys(categoryCounts).sort(
          (a, b) => categoryCounts[b] - categoryCounts[a]
        );

        metrics.layers.layer2.quinn = {
          findingsCount: quinnFindings,
          topCategories
        };
      }
    }

    // Calcula as tendências diárias (pass rate e auto-catch rate) agrupadas por data
    const dailyData = {};

    history.forEach((run) => {
      // Extrai YYYY-MM-DD do timestamp ISO de forma estável
      const date = run.timestamp.substring(0, 10);
      if (!dailyData[date]) {
        dailyData[date] = {
          runs: [],
          findingsL1: 0,
          findingsL2: 0,
          findingsL3: 0
        };
      }
      dailyData[date].runs.push(run);
      
      if (run.layer === 1) dailyData[date].findingsL1 += (run.findingsCount || 0);
      if (run.layer === 2) dailyData[date].findingsL2 += (run.findingsCount || 0);
      if (run.layer === 3) dailyData[date].findingsL3 += (run.findingsCount || 0);
    });

    const sortedDates = Object.keys(dailyData).sort();
    
    metrics.trends.passRates = sortedDates.map((date) => {
      const dayInfo = dailyData[date];
      const passedCount = dayInfo.runs.filter((run) => run.passed).length;
      return {
        date,
        value: passedCount / dayInfo.runs.length
      };
    });

    metrics.trends.autoCatchRate = sortedDates.map((date) => {
      const dayInfo = dailyData[date];
      const autoFindings = dayInfo.findingsL1 + dayInfo.findingsL2;
      const totalFindings = autoFindings + dayInfo.findingsL3;
      return {
        date,
        value: totalFindings > 0 ? autoFindings / totalFindings : 1.0
      };
    });
  }
}

module.exports = { MetricsCollector };
