# Personel İmza ve Devam Takibi

Firebase/Firestore destekli personel devam uygulaması. Günlük fiziksel imza föyü üretir, geç kalma açıklamalarını dijital kayda alır ve tarih aralığına göre rapor/CSV çıktısı verir.

## Çalıştırma

```bash
npm.cmd install
npm.cmd run dev
```

Yerel adres:

```text
http://127.0.0.1:5173/
```

## Firebase Bağlantısı

1. Firebase Console üzerinde bir proje oluşturun.
2. Firestore Database'i etkinleştirin.
3. Authentication bölümünde Email/Password sağlayıcısını açın.
4. `.env.example` dosyasını `.env` olarak kopyalayın.
5. Firebase web app config değerlerini `.env` içine girin.

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Config girilmezse uygulama localStorage ile yerel taslak modda çalışır.

## Yönetici Girişi

Uygulamada kayıt olma ekranı yoktur. Yönetici kullanıcılarını Firebase Console üzerinden oluşturun:

1. `Authentication > Users > Add user` ile e-posta ve şifre oluşturun.
2. Oluşturulan kullanıcının `User UID` değerini kopyalayın.
3. Firestore'da `admins` koleksiyonu oluşturun.
4. Belge ID'si olarak kullanıcının UID değerini yazın.
5. Belgeye örnek alanlar ekleyin: `email` string, `role` string.

Firestore kuralları `staff` ve `attendance` verilerine sadece `admins/{uid}` belgesi bulunan kullanıcıların erişmesine izin verir.

## Firestore Koleksiyonları

- `admins`: yönetici yetki kayıtları
- `staff`: personel kartları
- `attendance`: günlük giriş kayıtları

Güvenlik kuralları için başlangıç dosyası: `firebase.rules`.

## Kullanım Akışı

1. `Personel` ekranından personel ekleyin veya `85 Şablon` ile örnek satır oluşturun.
2. `İmza Föyü` ekranından seçili gün için A4 ön/arka imza föyünü yazdırın.
3. Gün sonunda `Günlük Kayıt` ekranında giriş saati, durum ve açıklamaları girip kaydedin.
4. `Raporlar` ekranında tarih aralığı seçip kayıtları getirin veya CSV alın.

Varsayılan baskı düzeni 85 kişiyi tek kağıdın ön/arka yüzüne sığdırmak için sayfa başına 43 satır kullanır.
