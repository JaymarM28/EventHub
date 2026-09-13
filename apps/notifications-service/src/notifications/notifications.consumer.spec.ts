import { Test } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsService } from './notifications.service';

function mockContext() {
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const message = {};
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  return { context, channel };
}

describe('NotificationsConsumer', () => {
  let consumer: NotificationsConsumer;
  let notifications: { notify: jest.Mock };

  beforeEach(async () => {
    notifications = { notify: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsConsumer,
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    consumer = moduleRef.get(NotificationsConsumer);
  });

  it('order.paid: procesa y hace ack en éxito', async () => {
    notifications.notify.mockResolvedValue(undefined);
    const { context, channel } = mockContext();

    await consumer.handleOrderPaid(
      { eventId: 'ev-1', type: 'order.paid', occurredAt: 1, source: 's', payload: { orderId: 'o1', userId: 'u1', zoneId: 'z1' } },
      context,
    );

    expect(notifications.notify).toHaveBeenCalledWith('ev-1', 'order.paid', 'u1', expect.any(String), expect.any(String));
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('ticket.issued: procesa y hace ack en éxito', async () => {
    notifications.notify.mockResolvedValue(undefined);
    const { context, channel } = mockContext();

    await consumer.handleTicketIssued(
      { eventId: 'ev-2', type: 'ticket.issued', occurredAt: 1, source: 's', payload: { ticketId: 't1', orderId: 'o1', userId: 'u1', zoneId: 'z1' } },
      context,
    );

    expect(notifications.notify).toHaveBeenCalledWith('ev-2', 'ticket.issued', 'u1', expect.any(String), expect.any(String));
    expect(channel.ack).toHaveBeenCalled();
  });

  it('si falla el procesamiento, hace nack sin requeue (va a la DLQ)', async () => {
    notifications.notify.mockRejectedValue(new Error('DB caída'));
    const { context, channel } = mockContext();

    await consumer.handleOrderPaid(
      { eventId: 'ev-3', type: 'order.paid', occurredAt: 1, source: 's', payload: { orderId: 'o1', userId: 'u1', zoneId: 'z1' } },
      context,
    );

    expect(channel.nack).toHaveBeenCalledWith({}, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
