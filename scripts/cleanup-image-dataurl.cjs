// scripts/cleanup-image-dataurl.js
//
// 一次性：把所有 expense 文件裡的 imageDataUrl 欄位刪掉。
// 用途：image storage 改用 Firebase Storage 之後，舊的 base64 不需要了。
//
// 用法（從 repo root）：
//   node scripts/cleanup-image-dataurl.js --dry-run   # 只看會改幾筆
//   node scripts/cleanup-image-dataurl.js             # 真的跑
//
// 警告：會改 Firestore 資料，--dry-run 之後再看一次再跑真的。

const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
require('firebase/compat/auth');

const APP_ID = 'YOUR_APP_ID';

const firebaseConfig = {
    apiKey: "AIzaSyB8l7Od781kGHyI9pXMLBXvzt7NuuIyq8c",
    authDomain: "splite-expense-tracker.firebaseapp.com",
    projectId: "splite-expense-tracker",
    storageBucket: "splite-expense-tracker.firebasestorage.app",
    messagingSenderId: "425612895494",
    appId: "1:425612895494:web:b5889f1d83cafb41d7ea87",
};

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    console.log(DRY_RUN
        ? '🟡 DRY-RUN 模式：只會列出會改的資料，不會真的寫入 Firestore'
        : '🛑 真的要改 Firestore 資料了');

    // 匿名登入（Firestore rules 通常要求 auth；跟 React app 一樣用匿名）
    await auth.signInAnonymously();
    console.log('✅ 登入成功，uid:', auth.currentUser.uid);

    // 掃所有 group
    const groupsSnap = await db.collection(`artifacts/${APP_ID}/groups`).get();
    console.log(`找到 ${groupsSnap.size} 個 group\n`);

    let totalFound = 0;
    const updates = [];

    for (const groupDoc of groupsSnap.docs) {
        const expensesSnap = await db.collection(`artifacts/${APP_ID}/groups/${groupDoc.id}/expenses`).get();
        for (const expDoc of expensesSnap.docs) {
            const data = expDoc.data();
            if (data.imageDataUrl) {
                totalFound++;
                const size = data.imageDataUrl.length;
                const desc = (data.description || '(no description)').slice(0, 30);
                console.log(`  [${groupDoc.id.substring(0, 8)}…/${expDoc.id.substring(0, 8)}…] imageDataUrl: ${size} bytes  desc: "${desc}"`);

                if (!DRY_RUN) {
                    updates.push(
                        expDoc.ref.update({
                            imageDataUrl: firebase.firestore.FieldValue.delete(),
                        })
                    );
                }
            }
        }
    }

    if (DRY_RUN) {
        console.log(`\n📊 DRY-RUN 結果：會清 ${totalFound} 筆。確定要跑就把 --dry-run 拿掉。`);
    } else {
        if (updates.length === 0) {
            console.log('\n📊 沒有需要清的資料。');
        } else {
            console.log(`\n🛠️ 開始清 ${updates.length} 筆...`);
            const results = await Promise.allSettled(updates);
            const ok = results.filter(r => r.status === 'fulfilled').length;
            const fail = results.filter(r => r.status === 'rejected').length;
            console.log(`✅ 完成：成功 ${ok}，失敗 ${fail}`);
        }
    }

    process.exit(0);
}

main().catch(e => {
    console.error('❌ 錯誤:', e);
    process.exit(1);
});
