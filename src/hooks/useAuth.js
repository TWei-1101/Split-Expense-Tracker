import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

export function readSharedCollectionId(href) {
  const url = new URL(href);
  const marker = '/g/';
  const index = url.pathname.indexOf(marker);
  return index === -1 ? null : url.pathname.slice(index + marker.length).split('/')[0] || null;
}

export default function useAuth({ getFirebaseServices, onUser, onInitializationError }) {
  const [auth, setAuth] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [db, setDb] = useState(null);
  const onUserRef = useRef(onUser);
  const onInitializationErrorRef = useRef(onInitializationError);
  onUserRef.current = onUser;
  onInitializationErrorRef.current = onInitializationError;

  useEffect(() => {
    try {
      const services = getFirebaseServices();
      setDb(services.db);
      setAuth(services.auth);
      const unsubscribe = onAuthStateChanged(services.auth, async (user) => {
        try {
          await onUserRef.current(user, services);
        } catch (error) {
          onInitializationErrorRef.current(error);
        } finally {
          setAuthReady(true);
        }
      });
      return () => unsubscribe();
    } catch (error) {
      onInitializationErrorRef.current(error);
      setAuthReady(true);
      return undefined;
    }
  }, [getFirebaseServices]);

  return { auth, authReady, db };
}
