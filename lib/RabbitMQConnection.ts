import { RabbitMQClient } from "./RabbitMQClient";

export class RabbitMQConnection {
  private static rabbitMQClient: RabbitMQClient | null = null;

  static getClient(): RabbitMQClient {
    if (!RabbitMQConnection.rabbitMQClient) {
      throw new Error(
        "RabbitMQ client not initialized. Call connect before accessing the client."
      );
    }
    return RabbitMQConnection.rabbitMQClient;
  }

  /**
   * Creates the shared client and connects in the background. If the broker is
   * not reachable yet it keeps retrying; publishers wait for it and consumers
   * start once it is up. Never throws and never leaves an unhandled rejection.
   */
  static connect(rabbitMQUrl: string): void {
    if (!RabbitMQConnection.rabbitMQClient) {
      RabbitMQConnection.rabbitMQClient = new RabbitMQClient(rabbitMQUrl);
      RabbitMQConnection.rabbitMQClient.connect().catch((error) => {
        console.error("Error connecting to RabbitMQ:", error);
      });
    }
  }

  /** @internal Clears the shared client between tests. */
  static resetForTests(): void {
    RabbitMQConnection.rabbitMQClient = null;
  }

  static close(): void {
    if (!RabbitMQConnection.rabbitMQClient) {
      throw new Error(
        "RabbitMQ client not initialized. Call connect before accessing the client."
      );
    }
    RabbitMQConnection.rabbitMQClient.close().catch((error) => {
      console.error("Error closing RabbitMQ connection:", error);
    });
  }
}
