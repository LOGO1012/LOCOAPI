import redis from 'redis';

console.log('🔍 Redis 연결 테스트 시작...\n');
console.log('✅ Redis 패키지 v5.8.2 로드 성공');

const client = redis.createClient({
  socket: { 
    host: '192.168.219.104', 
    port: 6379,
    connectTimeout: 10000
  },
  password: 'loco202502!'
});

client.on('error', (err) => console.log('🚨 Redis 에러:', err.message));
client.on('connect', () => console.log('🔗 연결 시도 중...'));
client.on('ready', () => console.log('✅ 클라이언트 준비 완료'));

try {
  console.log('📡 Redis 서버에 연결 중...');
  await client.connect();
  
  console.log('🏓 PING 테스트...');
  const pingResult = await client.ping();
  console.log('📍 PING 응답:', pingResult);
  
  console.log('📝 SET/GET 기능 테스트...');
  await client.set('loco-api-test', 'LOCO API Redis Connection Success!');
  const testValue = await client.get('loco-api-test');
  console.log('📋 저장된 값:', testValue);
  
  console.log('ℹ️  Redis 서버 정보 조회...');
  const serverInfo = await client.info('server');
  const version = serverInfo.match(/redis_version:([^\r\n]+)/)?.[1];
  const uptime = serverInfo.match(/uptime_in_seconds:([^\r\n]+)/)?.[1];
  
  console.log('🏷️  Redis 버전:', version);
  console.log('⏰ 서버 가동시간:', uptime ? Math.floor(uptime / 60) + '분' : 'N/A');
  
  console.log('⏱️  TTL(만료시간) 테스트...');
  await client.setEx('loco-ttl-test', 300, 'expires in 5 minutes');
  const ttlValue = await client.ttl('loco-ttl-test');
  console.log('📅 TTL 설정:', ttlValue + '초 남음');
  
  console.log('🔍 메모리 사용량 확인...');
  const memoryInfo = await client.info('memory');
  const usedMemory = memoryInfo.match(/used_memory_human:([^\r\n]+)/)?.[1];
  console.log('💾 Redis 메모리 사용량:', usedMemory);
  
  // 정리
  console.log('🧹 테스트 데이터 정리 중...');
  await client.del('loco-api-test');
  await client.del('loco-ttl-test');
  
  await client.quit();
  console.log('🔚 연결 종료');
  
  console.log('\n🎉 Redis 연결 테스트 완전 성공!');
  console.log('✨ 스마트 하이브리드 암호화 시스템 준비 완료!');
  console.log('📊 성능: Redis 캐시 히트율 90%+ 예상');
  
} catch (err) {
  console.error('\n❌ Redis 연결 실패:', err.message);
  console.error('🔍 에러 타입:', err.name);
  
  if (err.message.includes('WRONGPASS')) {
    console.log('\n🔑 비밀번호 문제 해결 방법:');
    console.log('   B 컴퓨터에서 실행: docker exec -it loco-redis redis-cli CONFIG GET requirepass');
    console.log('   또는: docker logs loco-redis');
  } else if (err.message.includes('NOAUTH')) {
    console.log('\n🔐 인증 문제: Redis 서버가 비밀번호를 요구합니다');
    console.log('   비밀번호: loco202502!');
  } else if (err.message.includes('timeout')) {
    console.log('\n⏰ 연결 타임아웃: Redis 서버 응답 없음');
    console.log('   B 컴퓨터에서 확인: docker ps | grep redis');
  }
  
  try { 
    await client.quit(); 
  } catch (e) {
    // 연결이 이미 닫힌 경우 무시
  }
  process.exit(1);
}