const request = require('supertest');
const app = require('../../Backend/app');
const mongoose = require('mongoose');
const User = require('../../Backend/models/users');
const Conversation = require('../../Backend/models/Conversation');

describe('Conversation Suite', () => {
  let testUser1, testUser2, testUser3;

  beforeEach(async () => {
    // Clean database
    await mongoose.connection.dropDatabase();

    // Create test users
    testUser1 = await User.create({
      username: 'testUser1',
      email: 'user1@example.com',
      password: 'password123'
    });

    testUser2 = await User.create({
      username: 'testUser2',
      email: 'user2@example.com',
      password: 'password123'
    });

    testUser3 = await User.create({
      username: 'testUser3',
      email: 'user3@example.com',
      password: 'password123'
    });
  });

  afterEach(async () => {
    await mongoose.connection.close();
  });

  test('Create conversation between users', async () => {
    const res1 = await request(app).post('/api/messaging/conversations')
      .set('Authorization', `Bearer ${testUser1.token}`);

    const res2 = await request(app).post('/api/messaging/conversations')
      .set('Authorization', `Bearer ${testUser2.token}`);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body.participants.length).toBe(2);
  });

  test('Get conversations for user', async () => {
    // Create conversation
    const conversation = await Conversation.create({
      participants: [testUser1._id, testUser2._id],
      isGroup: false
    });

    const res = await request(app).get('/api/messaging/conversations')
      .set('Authorization', `Bearer ${testUser1.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].participants.length).toBe(2);
  });

  test('Get conversation with specific user', async () => {
    const res = await request(app).get(`/api/messaging/conversations/with/${testUser2._id}`)
      .set('Authorization', `Bearer ${testUser1.token}`);

    expect(res.status).toBe(200);
    expect(res.body.participants.length).toBe(2);
    expect(res.body.isGroup).toBe(false);
  });

  test('Archive conversation', async () => {
    const conversation = await Conversation.create({
      participants: [testUser1._id, testUser2._id],
      isGroup: false
    });

    const res = await request(app).delete(`/api/messaging/conversations/${conversation._id}/archive`)
      .set('Authorization', `Bearer ${testUser1.token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Conversation archived');
  });

  test('Unarchive conversation', async () => {
    const conversation = await Conversation.create({
      participants: [testUser1._id, testUser2._id],
      isGroup: false,
      archivedBy: [testUser1._id]
    });

    const res = await request(app).patch(`/api/messaging/conversations/${conversation._id}/unarchive`)
      .set('Authorization', `Bearer ${testUser1.token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Conversation unarchived');
  });

  test('Get conversation with non-existent user', async () => {
    const res = await request(app).get(`/api/messaging/conversations/with/${mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${testUser1.token}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Other user not found');
  });

  test('Get conversations for unauthorized user', async () => {
    const res = await request(app).get('/api/messaging/conversations')
      .set('Authorization', 'Bearer invalid_token');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });
});