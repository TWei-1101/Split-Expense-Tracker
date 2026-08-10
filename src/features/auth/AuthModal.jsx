import { memo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';

const AuthModal = memo(({ auth, isOpen, onClose, onAuthenticated, setToastMessage, closeIcon }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);

    if (!email || !password || (!isLogin && !nickname)) {
      setToastMessage('❌ 請輸入所有必填欄位。');
      setIsLoading(false);
      return;
    }

    try {
      let userCredential;
      let finalDisplayName = nickname.trim();

      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        finalDisplayName = userCredential.user.displayName || email;
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: finalDisplayName });
      }

      await onAuthenticated(userCredential.user, finalDisplayName, email);
      setToastMessage(`✅ 登入成功！歡迎 ${finalDisplayName}。`);
      onClose();
    } catch (error) {
      console.error('Auth error:', error.code, error.message);
      let displayError = error.message;
      if (error.code === 'auth/email-already-in-use') displayError = '該電子郵件已被註冊，請直接登入或使用不同郵件。';
      else if (error.code === 'auth/invalid-email') displayError = '無效的電子郵件格式。';
      else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') displayError = '電子郵件或密碼錯誤。';
      else if (error.code === 'auth/weak-password') displayError = '密碼強度不足，請使用至少 6 個字元。';
      setToastMessage(`❌ 登入/註冊失敗: ${displayError}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center p-4 z-50 force-gpu">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6 sm:p-8 force-gpu relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 text-gray-600 transition hover:scale-110 transform">
          {closeIcon}
        </button>
        <h3 className="text-3xl font-bold text-primaryColor-600 text-center mb-6">{isLogin ? '登入紀錄簿' : '註冊新帳號'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">暱稱 (顯示名稱)</label>
            <input type="text" id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="請輸入您的暱稱" className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500" disabled={isLoading} required={!isLogin} />
          </div>}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">電子郵件</label>
            <input type="email" id="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="your.email@example.com" className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500" disabled={isLoading} />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">密碼 (至少 6 位)</label>
            <input type="password" id="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="******" className="mt-1 block w-full border border-gray-300 rounded-lg shadow-sm p-3 focus:ring-primaryColor-500 focus:border-primaryColor-500" disabled={isLoading} minLength="6" />
          </div>
          <button type="submit" disabled={isLoading} className={'w-full flex items-center justify-center px-4 py-3 rounded-full text-white font-semibold transition duration-300 shadow-lg ' + (isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-primaryColor-600 hover:bg-primaryColor-700')}>
            {isLoading ? '處理中...' : (isLogin ? '登入' : '註冊')}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => { setIsLogin((previous) => !previous); setToastMessage(null); setNickname(''); }} className="text-primaryColor-600 hover:text-primaryColor-800 font-medium text-sm">
            {isLogin ? '還沒有帳號？點此註冊' : '已經有帳號了？點此登入'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default AuthModal;
