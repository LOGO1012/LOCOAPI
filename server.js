const express =require("express") //자바스크립트 끼리 파일 임포트가 됩니다.
const app = express()
app.use(express.json())

app.listen(8000,() => {
    console.log("test message")
})