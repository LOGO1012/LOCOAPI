// backend/controllers/naverPayController.js
import axios from 'axios';

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID; // 네이버 클라이언트 아이디
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET; // 네이버 클라이언트 시크릿

export const naverPayReady = async (req, res) => {
    const { productId, amount } = req.body;

    // 실제 서비스에서는 productId를 사용해 상품 정보를 조회할 수 있습니다.
    const productName = "예시 상품명"; // 예시 값. 실제 상품명으로 대체

    // 네이버 결제 준비 요청 파라미터 구성
    // 아래 예시는 참고용으로, 실제 네이버 결제 API 명세에 맞게 수정해야 합니다.
    const data = {
        productId: productId,
        productName: productName,
        amount: amount,
        orderId: productId,
        returnUrl: `${process.env.BASE_URL}/api/naver-pay/approve`,
        cancelUrl: `${process.env.BASE_URL}/api/naver-pay/cancel`
        // 추가 필드가 필요할 수 있습니다.
    };

    try {
        // 네이버 결제 API 엔드포인트 URL (공식 문서를 참고하여 수정)
        const response = await axios.post(
            'https://api.naver.com/payments/ready',
            data,
            {
                headers: {
                    'X-Naver-Client-Id': NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
                    'Content-Type': 'application/json'
                }
            }
        );
        // 응답 데이터에 포함된 결제 URL을 클라이언트에 반환
        res.json(response.data);
    } catch (error) {
        console.error('NaverPay ready error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'NaverPay 준비 실패' });
    }
};
