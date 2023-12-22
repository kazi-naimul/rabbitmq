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

  static connect(rabbitMQUrl: string): void {
    if (!RabbitMQConnection.rabbitMQClient) {
      RabbitMQConnection.rabbitMQClient = new RabbitMQClient(rabbitMQUrl);
      // Additional connection logic if needed
      RabbitMQConnection.rabbitMQClient.connect();
    }
  }

  static close(): void {
    if (!RabbitMQConnection.rabbitMQClient) {
      throw new Error(
        "RabbitMQ client not initialized. Call connect before accessing the client."
      );
    }
    RabbitMQConnection.rabbitMQClient.close();
  }
}
