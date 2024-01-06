# RabbitMQ Helper

## Installation

To integrate the RabbitMQ Helper package into your project, use the following command:

```bash
yarn add @kazinaimul/rabbitmq
```

## RabbitMQ Server
You can use following docker file to create a RabbitMQ server:
```
FROM rabbitmq:3.12.0-management

RUN apt-get update

RUN apt-get install -y curl

RUN curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > $RABBITMQ_HOME/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez

RUN chown rabbitmq:rabbitmq $RABBITMQ_HOME/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez

RUN rabbitmq-plugins enable --offline rabbitmq_delayed_message_exchange

RUN rabbitmq-plugins enable --offline rabbitmq_consistent_hash_exchange
```
# To be noted this package requires following plugins to enabled:
    rabbitmq_delayed_message_exchange
    rabbitmq_consistent_hash_exchange
## Usage

### Establishing Connection

In your Express app's `app.js` file, establish a connection to RabbitMQ using the following code:

```javascript
import { RabbitMQConnection } from '@kazinaimul/rabbitmq';

RabbitMQConnection.connect('RABBITMQ_CONNECTION_URL');
```

Replace `RABBITMQ_CONNECTION_URL` with your RabbitMQ server connection URL, formatted as `amqp://username:password@localhost:5672`.

### Publishing a Message

To publish a message, create a Publisher class by extending the provided `Publisher` class from the package. Here is an example:

```javascript
import { Publisher } from '@kazinaimul/rabbitmq';

export class PublishMessage extends Publisher {
    constructor() {
        const queueName = 'queue-name';
        super(queueName);
    }

    async publish<MessageType>(message: MessageType): Promise<void> {
        try {
            const customOptions = {
                exchange: `your-exchange_name`,
                routingKey: queueName,
                delay: 0,
                exchangeType: "direct",
                headers: {},
            }; // Custom optional values, overwriting default options
            await this.rabbitMQClient.publish(this.queueName, message, customOptions);
        } catch (error) {
            console.error('Error publishing messages:', error);
        }
    }
}
```

By default, the package uses the following options to publish a message:

```javascript
const defaultOptions = {
    exchange: `Exchange_${queueName}`,
    routingKey: queueName,
    delay: 0,
    exchangeType: "direct",
    headers: {},
};
```
Here queueName is the given Queue Name while initialize the class.
You can customize these options as needed.

You can then use this class to publish messages anywhere in your application:

```javascript
const publisher = new PublishMessage();
publisher.publish(publishJson);
```

### Consuming Messages

To consume messages, create a Consumer class by extending the provided `Consumer` class from the package. Here is an example:

```javascript
import { Consumer } from '@kazinaimul/rabbitmq';

export class MyConsumer extends Consumer {
    constructor() {
        const queueName = 'queue-name';
        const options = {
            retry: true, // If true, messages will be queued again in case of an error (default is true)
            retry_count: 3, // Maximum retry count, beyond which the message will be moved to an error queue
            retry_delay: 0 // Delay in milliseconds for retries
        };
        super(queueName, options); // Options is an optional field
    }

    async execute<T extends object>(message: T): Promise<void> {
        // Implement your own logic to handle the consumed message
    }
}
```

Register your consumers in a file (e.g., `consumerRegister.ts`):

```javascript
import { MyConsumer } from './MyConsumer';

export const consumerRegister: any[] = [new MyConsumer()];
```

In your application, consume messages by iterating through the registered consumers:

```javascript
import { consumerRegister } from './consumerRegister';

// Consume messages from registered consumers
for (const consumer of consumerRegister) {
    consumer.consume();
}
```

Now, the `MyConsumer` class will process messages from the specified queue.

Remember to replace `'queue-name'` with the actual queue name you want to use.

## Notes

- Replace placeholder values and adjust configurations according to your RabbitMQ setup.
- For further customization, refer to the provided classes in the package and their methods.

Feel free to reach out if you encounter any issues or have questions related to this package. Happy coding!
