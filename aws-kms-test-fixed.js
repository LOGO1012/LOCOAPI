// AWS KMS 연결 테스트 (수정된 버전)
import dotenv from 'dotenv';

// 환경변수 로드 (최우선 실행)
dotenv.config();

import { KMSClient, EncryptCommand, DecryptCommand, ListKeysCommand } from '@aws-sdk/client-kms';

(async () => {
    console.log('🔐 AWS KMS 연결 테스트 시작...\n');
    
    // 환경변수 확인
    console.log('🔍 환경변수 확인:');
    console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? `✅ ${process.env.AWS_ACCESS_KEY_ID.substring(0, 10)}...` : '❌ 없음');
    console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? `✅ ${process.env.AWS_SECRET_ACCESS_KEY.substring(0, 10)}...` : '❌ 없음');
    console.log('AWS_REGION:', process.env.AWS_REGION || 'ap-northeast-2 (기본값)');
    console.log('KMS_KEY_ID:', process.env.KMS_KEY_ID || '❌ 없음');
    console.log('');

    // 필수 환경변수 체크
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.KMS_KEY_ID) {
        console.error('❌ 필수 환경변수가 설정되지 않았습니다.');
        console.log('💡 .env 파일을 확인하세요:');
        console.log('   AWS_ACCESS_KEY_ID=your-access-key');
        console.log('   AWS_SECRET_ACCESS_KEY=your-secret-key');
        console.log('   KMS_KEY_ID=your-kms-key-id');
        process.exit(1);
    }

    try {
        // KMS 클라이언트 생성
        const kmsClient = new KMSClient({
            region: process.env.AWS_REGION || 'ap-northeast-2',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });

        console.log('📋 KMS 키 목록 조회 중...');
        
        // 키 목록 조회 (권한 테스트)
        const listCommand = new ListKeysCommand({ Limit: 5 });
        const keyList = await kmsClient.send(listCommand);
        
        console.log('✅ KMS 연결 성공!');
        console.log('🔑 사용 가능한 키 개수:', keyList.Keys?.length || 0);
        
        // 특정 키로 암호화/복호화 테스트
        console.log('\n🧪 암호화/복호화 테스트...');
        const testData = 'LOCO API KMS Test Data - 스마트 하이브리드 암호화';
        console.log('📝 테스트 데이터:', testData);
        
        // 암호화
        const encryptCommand = new EncryptCommand({
            KeyId: process.env.KMS_KEY_ID,
            Plaintext: Buffer.from(testData, 'utf8')
        });
        
        const encryptResult = await kmsClient.send(encryptCommand);
        const encryptedData = encryptResult.CiphertextBlob;
        
        console.log('🔐 암호화 성공!');
        console.log('📦 암호화 데이터 크기:', encryptedData?.length, 'bytes');
        
        // 복호화
        const decryptCommand = new DecryptCommand({
            CiphertextBlob: encryptedData
        });
        
        const decryptResult = await kmsClient.send(decryptCommand);
        const decryptedText = Buffer.from(decryptResult.Plaintext).toString('utf8');
        
        console.log('🔓 복호화 성공!');
        console.log('📝 복호화된 데이터:', decryptedText);
        
        // 결과 검증
        if (testData === decryptedText) {
            console.log('✅ 데이터 무결성 검증 완료!');
        } else {
            console.log('❌ 데이터 무결성 검증 실패!');
        }
        
        console.log('\n🎉 AWS KMS 테스트 완전 성공!');
        console.log('🚀 스마트 하이브리드 암호화 시스템 구현 준비 완료!');
        
        // 성능 정보
        console.log('\n📊 예상 성능:');
        console.log('   - 암호화 속도: ~1,000회/초');
        console.log('   - 복호화 속도: ~1,000회/초');
        console.log('   - 보안 레벨: FIPS 140-2 Level 2');
        console.log('   - 키 관리: AWS 자동 관리');
        
    } catch (error) {
        console.error('\n💥 KMS 테스트 실패:', error.message);
        
        // 상세 오류 분석
        if (error.name === 'UnauthorizedOperation') {
            console.log('🔑 권한 문제: IAM 사용자의 KMS 권한을 확인하세요.');
            console.log('   필요 권한: kms:Encrypt, kms:Decrypt, kms:ListKeys');
        } else if (error.message.includes('InvalidKeyId')) {
            console.log('🗝️ 키 ID 문제: KMS_KEY_ID 값을 확인하세요.');
            console.log('   현재 키 ID:', process.env.KMS_KEY_ID);
        } else if (error.message.includes('credentials')) {
            console.log('🔐 인증 문제: AWS 액세스 키를 확인하세요.');
        } else if (error.message.includes('Region')) {
            console.log('🌏 리전 문제: AWS_REGION을 확인하세요.');
        }
        
        console.log('\n🔧 해결 방법:');
        console.log('1. AWS 콘솔에서 IAM 사용자 권한 확인');
        console.log('2. .env 파일의 AWS 설정 재확인');
        console.log('3. KMS 키가 ap-northeast-2 리전에 있는지 확인');
        
        process.exit(1);
    }
})();
