import { KMSClient, ListKeysCommand, DescribeKeyCommand, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

console.log('🔐 AWS KMS 연결 테스트 시작...\n');

// KMS 클라이언트 생성 (환경변수에서 자격증명 자동 로드)
const kmsClient = new KMSClient({ 
  region: 'ap-northeast-2' // 서울 리전
});

async function testKMSConnection() {
  try {
    // 1. KMS 연결 테스트 - 키 목록 조회
    console.log('📋 KMS 키 목록 조회 중...');
    const listKeysResponse = await kmsClient.send(new ListKeysCommand({}));
    
    console.log(`✅ 사용 가능한 키 개수: ${listKeysResponse.Keys.length}`);
    
    if (listKeysResponse.Keys.length === 0) {
      console.log('⚠️  키가 없습니다. AWS 콘솔에서 KMS 키를 먼저 생성하세요.');
      return;
    }
    
    // 첫 번째 키로 테스트
    const firstKey = listKeysResponse.Keys[0];
    console.log(`🔑 테스트 키 ID: ${firstKey.KeyId}`);
    
    // 2. 키 상세 정보 조회
    console.log('\n🔍 키 상세 정보 조회 중...');
    const describeKeyResponse = await kmsClient.send(new DescribeKeyCommand({
      KeyId: firstKey.KeyId
    }));
    
    const keyMetadata = describeKeyResponse.KeyMetadata;
    console.log(`📄 키 별칭: ${keyMetadata.Description || 'N/A'}`);
    console.log(`📊 키 상태: ${keyMetadata.KeyState}`);
    console.log(`🏗️  키 생성일: ${keyMetadata.CreationDate}`);
    console.log(`🔒 키 사용법: ${keyMetadata.KeyUsage}`);
    
    // 3. 암호화/복호화 테스트
    console.log('\n🧪 암호화/복호화 테스트 중...');
    const testData = 'LOCO API - KMS 암호화 테스트 데이터';
    console.log(`📝 원본 데이터: "${testData}"`);
    
    // 암호화
    const encryptResponse = await kmsClient.send(new EncryptCommand({
      KeyId: firstKey.KeyId,
      Plaintext: Buffer.from(testData, 'utf8')
    }));
    
    const encryptedData = encryptResponse.CiphertextBlob;
    console.log(`🔐 암호화 완료 (${encryptedData.length} bytes)`);
    
    // 복호화
    const decryptResponse = await kmsClient.send(new DecryptCommand({
      CiphertextBlob: encryptedData
    }));
    
    const decryptedData = Buffer.from(decryptResponse.Plaintext).toString('utf8');
    console.log(`🔓 복호화 결과: "${decryptedData}"`);
    
    // 4. 성공 확인
    if (testData === decryptedData) {
      console.log('\n🎉 AWS KMS 연결 및 암호화 테스트 완전 성공!');
      console.log('✨ LOCO 스마트 하이브리드 시스템에 KMS 적용 준비 완료!');
      console.log(`🔑 사용할 키 ID: ${firstKey.KeyId}`);
    } else {
      console.log('\n❌ 데이터 무결성 검증 실패');
    }
    
  } catch (error) {
    console.error('\n💥 KMS 테스트 실패:', error.message);
    
    if (error.name === 'UnrecognizedClientException') {
      console.log('🔐 자격증명 문제:');
      console.log('   1. AWS_ACCESS_KEY_ID 환경변수 확인');
      console.log('   2. AWS_SECRET_ACCESS_KEY 환경변수 확인');
      console.log('   3. IAM 사용자 권한 확인');
    } else if (error.name === 'AccessDeniedException') {
      console.log('🚫 권한 부족:');
      console.log('   1. IAM 사용자에게 KMS 권한 추가');
      console.log('   2. 키 정책에서 해당 사용자 허용');
    } else if (error.name === 'InvalidKeyId.NotFound') {
      console.log('🔍 키를 찾을 수 없음:');
      console.log('   1. AWS 콘솔에서 KMS 키 생성');
      console.log('   2. 올바른 리전 확인 (현재: ap-northeast-2)');
    }
  }
}

// 환경변수 확인
console.log('🔍 환경변수 확인:');
console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`AWS_REGION: ${process.env.AWS_REGION || 'ap-northeast-2 (기본값)'}`);
console.log('');

testKMSConnection();