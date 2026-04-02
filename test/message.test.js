const request = require('supertest');
const app = require('../../Backend/app');
const mongoose = require('mongoose');
const Message = require('../../Backend/models/Message');
const Conversation = require('../../Backend/models/Conversation');
const User = require('../../Backend/models/users');

describe('Message Suite', () => {
  let testUser, testConversation;

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    testUser = await User.create({ username: 'testUser', email: 'test@example.com', password: 'password' });
    testConversation = await Conversation.create({ participants: [testUser._id] });
  });

  afterEach(async () => {
    await mongoose.connection.close();
  });

  test('Send message to conversation', async () => {
    const res = await request(app).post('/api/messaging/messages')
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({ conversationId: testConversation._id, text: 'Hello' });

    expect(res.status).toBe(201);
    expect(res.body.text).toBe('Hello');
    expect(res.body.conversation).toBe(testConversation._id);
  });

  test('Message read status', async () => {
    const message = await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Test message'
    });

    const res = await request(app).post(`/api/messaging/messages/${message._id}/mark-read`)
      .set('Authorization', `Bearer ${testUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Marked as read');
  });

  test('Message editing', async () => {
    const message = await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Original message'
    });

    const res = await request(app).put(`/api/messaging/messages/${message._id}`)
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({ text: 'Edited message' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Edited message');
    expect(res.body.isEdited).toBe(true);
  });

  test('Message deletion', async () => {
    const message = await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Test message'
    });

    const res = await request(app).delete(`/api/messaging/messages/${message._id}`)
      .set('Authorization', `Bearer ${testUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Message deleted');
  });

  test('Add reaction', async () => {
    const message = await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Test message'
    });

    const res = await request(app).post(`/api/messaging/messages/${message._id}/reactions`)
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
    expect(res.body.reactions).toBeDefined();
  });

  test('Remove reaction', async () => {
    const message = await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Test message',
      reactions: new Map([['👍', [testUser._id]]])
    });

    const res = await request(app).delete(`/api/messaging/messages/${message._id}/reactions`)
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({ emoji: '👍' });

    expect(res.status).toBe(200);
  });

  test('Get messages with pagination', async () => {
    await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Message 1'
    });
    await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Message 2'
    });
    await Message.create({
      conversation: testConversation._id,
      sender: testUser._id,
      text: 'Message 3'
    });

    const res = await request(app).get(`/api/messaging/messages/${testConversation._id}?limit=2&skip=0`)
      .set('Authorization', `Bearer ${testUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  test('Unauthorized user cannot send message', async () => {
    const res = await request(app).post('/api/messaging/messages')
      .send({ conversationId: testConversation._id, text: 'Hello' });

    expect(res.status).toBe(401);
  });

  test('User not in conversation cannot send message', async () => {
    const otherUser = await User.create({ username: 'otherUser', email: 'other@example.com', password: 'password' });
    const res = await request(app).post('/api/messaging/messages')
      .set('Authorization', `Bearer ${otherUser.token}`)
      .send({ conversationId: testConversation._id, text: 'Hello' });

    expect(res.status).toBe(403);
  });
});