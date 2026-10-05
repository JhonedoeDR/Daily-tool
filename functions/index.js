const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const db = getFirestore();
const MAX_TOKENS_PER_USER = 10;

exports.registerNotificationToken = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before registering a notification token.');
  }

  const token = request.data && request.data.token;
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    throw new HttpsError('invalid-argument', 'A valid notification token is required.');
  }

  const deviceRef = db.collection('notifyDevices').doc(request.auth.uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(deviceRef);
    const tokens = snapshot.exists && Array.isArray(snapshot.data().tokens)
      ? snapshot.data().tokens
      : [];
    if (!tokens.includes(token) && tokens.length >= MAX_TOKENS_PER_USER) {
      throw new HttpsError('resource-exhausted', 'Too many notification tokens are registered.');
    }
    transaction.set(deviceRef, {
      tokens: FieldValue.arrayUnion(token),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  const legacyStateRef = db.collection('notify').doc('state');
  const legacyState = await legacyStateRef.get();
  if (legacyState.exists && Object.prototype.hasOwnProperty.call(legacyState.data(), 'tokens')) {
    await legacyStateRef.update({ tokens: FieldValue.delete() });
  }

  return { registered: true };
});
