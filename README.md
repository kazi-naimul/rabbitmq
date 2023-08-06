# RabbitMQ-helper
# RabbitMQ Consumer Class

The `Consumer` class is an abstract class that provides a foundation for implementing RabbitMQ consumers in TypeScript. It handles the process of connecting to a RabbitMQ server, consuming messages from a specified queue, and executing a callback function to process the received messages.

## Class Overview

The `Consumer` class has the following properties:

- `url` (string): The URL of the RabbitMQ server.
- `queueName` (string): The name of the queue to consume messages from.
- `retry` (boolean): Specifies whether to retry processing a message in case of an error. Defaults to `true`.
- `retryCount` (number): The maximum number of retries before pushing a message to the error queue. Defaults to `3`.
- `retryDelay` (number): The delay in milliseconds between retries. Defaults to `0`.
- `rabbitMQClient` (RabbitMQClient): An instance of the `RabbitMQClient` class for interacting with RabbitMQ.

## Class Methods

### Constructor

The `Consumer` class constructor takes the following parameters:

- `url` (string): The URL of the RabbitMQ server.
- `queueName` (string): The name of the queue to consume messages from.
- `retry` (boolean, optional): Specifies whether to retry processing a message in case of an error. Defaults to `true`.
- `retryCount` (number, optional): The maximum number of retries before pushing a message to the error queue. Defaults to `3`.
- `retryDelay` (number, optional): The delay in milliseconds between retries. Defaults to `0`.

### execute<MessageType>(message: MessageType): void

An abstract method that needs to be implemented by the subclass. It defines the logic to be executed for each consumed message.

- `message` (MessageType): The consumed message to be processed.

### consume(): Promise<void>

Starts consuming messages from the specified queue. This method connects to the RabbitMQ server, sets up the message consuming process, and executes the `execute` method for each consumed message.

## Usage

To use the `Consumer` class, follow these steps:

1. Import the `RabbitMQClient` and `Consumer` classes:

```typescript
import { RabbitMQClient } from "./RabbitMQClient";
import { Consumer } from "./Consumer";
```

2. Create a subclass that extends the `Consumer` class and implement the `execute` method. For example:

```typescript
class MyConsumer extends Consumer {
  execute<MessageType>(message: MessageType): void {
    // Process the consumed message
    console.log("Received message:", message);
  }
}
```

3. Instantiate the `MyConsumer` class with the required parameters:

```typescript
const url = "amqp://localhost";
const queueName = "my_queue";
const retry = true;
const retryCount = 3;
const retryDelay = 1000; // 1 second

const consumer = new MyConsumer(url, queueName, retry, retryCount, retryDelay);
```

4. Call the `consume` method to start consuming messages:

```typescript
consumer
  .consume()
  .then(() => {
    console.log("Consuming messages...");
  })
  .catch((error) => {
    console.error("Error consuming messages:", error);
  });
```

5. When a message is received, the `execute` method of your subclass will be called. Implement the desired logic inside the `execute` method to process the message.

```typescript
class MyConsumer extends Consumer {
  execute<MessageType>(message: MessageType): void {
    // Process the consumed message
    console.log("Received message:", message);

    // Implement your logic here
  }
}
```

That's it! You have now set up a RabbitMQ consumer using the `Consumer` class. The subclass can be customized to handle specific message processing logic for your application.

# RabbitMQ Publisher Class

The `Publisher` class is an abstract class that provides a foundation for implementing RabbitMQ publishers in TypeScript. It handles the process of connecting to a RabbitMQ server and publishing messages to a specified queue.

## Class Overview

The `Publisher` class has the following properties:

- `url` (string): The URL of the RabbitMQ server.
- `queueName` (string): The name of the queue to publish messages to.
- `options` (object): Additional options for publishing messages.
- `rabbitMQClient` (RabbitMQClient): An instance of the `RabbitMQClient` class for interacting with RabbitMQ.

## Class Methods

### Constructor

The `Publisher` class constructor takes the following parameters:

- `url` (string): The URL of the RabbitMQ server.
- `queueName` (string): The name of the queue to publish messages to.
- `options` (object, optional): Additional options for publishing messages.

### publish<MessageType>(message: MessageType): void

An abstract method that needs to be implemented by the subclass. It defines the logic to publish a message to the specified queue.

- `message` (MessageType): The message to be published.

## Usage

To use the `Publisher` class, follow these steps:

1. Import the `RabbitMQClient` and `Publisher` classes:

```typescript
import { RabbitMQClient } from "./RabbitMQClient";
import { Publisher } from "./Publisher";
```

2. Create a subclass that extends the `Publisher` class and implement the `publish` method. For example:

```typescript
class MyPublisher extends Publisher {
  publish<MessageType>(message: MessageType): void {
    // Publish the message to the queue
    console.log("Publishing message:", message);
    this.rabbitMQClient.sendToQueue(this.queueName, message, this.options);
  }
}
```

3. Instantiate the `MyPublisher` class with the required parameters:

```typescript
const url = "amqp://localhost";
const queueName = "my_queue";
const options = {};

const publisher = new MyPublisher(url, queueName, options);
```

4. Call the `publish` method to publish a message:

```typescript
const message = { data: "Hello, RabbitMQ!" };

publisher.publish(message);
```

5. The `publish` method of your subclass will be called, and the message will be published to the specified queue.

```typescript
class MyPublisher extends Publisher {
  publish<MessageType>(message: MessageType): void {
    // Publish the message to the queue
    console.log("Publishing message:", message);
    this.rabbitMQClient.sendToQueue(this.queueName, message, this.options);

    // Implement your logic here
  }
}
```

That's it! You have now set up a RabbitMQ publisher using the `Publisher` class. The subclass can be customized to handle specific message publishing logic for your application.
