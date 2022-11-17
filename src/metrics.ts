import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';

/**
 * A wrapper for simple uses of CloudWatch Metrics.
 */
export class CloudWatchMetrics {
  private metrics: Metrics;

  constructor(options?: { project?: string }) {
    const project = options?.project ?? process.env.PROJECT ?? 'unknownProject';
    this.metrics = new Metrics({ namespace: project });
  }

  /**
   * Get the raw Metrics object. To use for custom purposes.
   */
  __raw(): Metrics {
    return this.metrics;
  }
  /**
   * Add an entry for the metrics.
   */
  addMetric(metricName: string, value = 1, unit: MetricUnits = MetricUnits.Count): void {
    this.metrics.addMetric(metricName, unit, value);
  }
  /**
   * Add a metadata useful when you want to search highly contextual information along with your metrics in your logs.
   */
  addMetadata(key: string, value: string): void {
    this.metrics.addMetadata(key, value);
  }
  /**
   * Add an additional metrics dimension.
   */
  addDimension(name: string, value: string, defaultValue = '-'): void {
    this.metrics.addDimension(name, value ?? defaultValue);
  }
  /**
   * Synchronous function to actually publish your metrics.
   * It will create a new EMF blob and log it to be then ingested by Cloudwatch logs and processed for metrics creation.
   */
  publishStoredMetrics(): void {
    this.metrics.publishStoredMetrics();
  }
}
