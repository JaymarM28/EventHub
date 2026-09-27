import { Test } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsService } from './notifications.service';
import { EventsClientService } from './events-client.service';

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
  let eventsClient: { findZoneWithOrganizer: jest.Mock };

  beforeEach(async () => {
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    eventsClient = {
      findZoneWithOrganizer: jest.fn().mockResolvedValue({
        eventId: 'ev-x',
        eventTitle: 'Concierto',
        organizerId: 'organizer-1',
        venue: 'Estadio',
        city: 'Bogotá',
        startsAt: new Date('2027-01-01T20:00:00.000Z').toISOString(),
        currency: 'COP',
        zoneName: 'General',
        zonePrice: '50000',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsConsumer,
        { provide: NotificationsService, useValue: notifications },
        { provide: EventsClientService, useValue: eventsClient },
      ],
    }).compile();

    consumer = moduleRef.get(NotificationsConsumer);
  });

  it('order.paid: notifica al comprador Y al organizador, con claves de idempotencia distintas, y hace ack en éxito', async () => {
    const { context, channel } = mockContext();

    await consumer.handleOrderPaid(
      { eventId: 'ev-1', type: 'order.paid', occurredAt: 1, source: 's', payload: { orderId: 'o1', userId: 'u1', zoneId: 'z1', quantity: 2 } },
      context,
    );

    expect(notifications.notify).toHaveBeenCalledWith('ev-1:buyer', 'order.paid', 'u1', expect.any(String), expect.any(String));
    expect(eventsClient.findZoneWithOrganizer).toHaveBeenCalledWith('z1');
    expect(notifications.notify).toHaveBeenCalledWith(
      'ev-1:organizer',
      'order.paid',
      'organizer-1',
      expect.any(String),
      expect.stringContaining('Concierto'),
    );
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('ticket.issued: procesa y hace ack en éxito', async () => {
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
      { eventId: 'ev-3', type: 'order.paid', occurredAt: 1, source: 's', payload: { orderId: 'o1', userId: 'u1', zoneId: 'z1', quantity: 2 } },
      context,
    );

    expect(channel.nack).toHaveBeenCalledWith({}, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
