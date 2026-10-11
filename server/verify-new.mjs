import mongoose from "mongoose"; import jwt from "jsonwebtoken"; import crypto from "crypto";
const BASE="http://127.0.0.1:4000/api", SECRET="0123456789abcdef0123456789abcdef0123456789abcdef";
const SA=crypto.createHash("sha256").update("09120000000\0admin@test.local","utf8").digest("hex");
const sign=p=>jwt.sign(p,SECRET,{expiresIn:"7d",issuer:"bella-api",audience:"bella-web"});
const ADMIN="bella_admin="+sign({superAdmin:true,adminSessionId:SA});
const rip=()=>`10.${Math.random()*255|0}.${Math.random()*255|0}.${Math.random()*255|0}`;
async function api(p,{method="GET",body,cookie}={}){const r=await fetch(BASE+p,{method,headers:{"Content-Type":"application/json","X-Forwarded-For":rip(),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return{status:r.status,json:j}}
await mongoose.connect("mongodb://127.0.0.1:27017/bella_test");
const {default:User}=await import("./src/models/User.js");
const {default:Settings}=await import("./src/models/Settings.js");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rnd=()=>"09"+String(Math.random()*1e9|0).padStart(9,"0");
const mkU=async()=>{const phone=rnd();const u=await User.create({phone,name:"تست",tokenVersion:0});return{phone,cookie:"bella_token="+sign({sub:String(u._id),tv:0})}};
const cats=await api("/categories"); const catId=cats.json?.categories?.[0]?.id;
const mkP=p=>api("/admin/products",{method:"POST",cookie:ADMIN,body:{active:true,stock:10,category:catId,...p}});
// set a coupon with minOrder
await Settings.findOneAndUpdate({},{$set:{couponEnabled:"1",couponCodesJson:JSON.stringify([{code:"MIN",percent:10,minOrder:2000000}])}},{upsert:true});
await sleep(5500);
const order=(items,phone,extra={})=>({customerName:"تست",phone,email:"t@t.com",province:"تهران",city:"تهران",postalCode:"1234567890",address:"خیابان ولیعصر، کوچهٔ تست، پلاک ۱، واحد ۲",termsAccepted:true,items,shippingMethod:"tipax",...extra});
// --- minOrder test ---
const pSmall=await mkP({name:"ارزان "+Date.now(),nameEn:"s",price:1000000});
const pBigv=await mkP({name:"گران "+Date.now(),nameEn:"b",price:5000000});
const U1=await mkU(); await api("/orders",{method:"POST",cookie:U1.cookie,body:order([{id:pSmall.json.product.id,qty:1}],U1.phone)}); // consume first-purchase
const minFail=await api("/orders",{method:"POST",cookie:U1.cookie,body:order([{id:pSmall.json.product.id,qty:1}],U1.phone,{couponCode:"MIN"})});
console.log("minOrder on 1,000,000 (min 2,000,000) =>", minFail.status, minFail.status===400?"PASS(rejected)":"FAIL", JSON.stringify(minFail.json?.error||"").slice(0,40));
const U2=await mkU(); await api("/orders",{method:"POST",cookie:U2.cookie,body:order([{id:pSmall.json.product.id,qty:1}],U2.phone)});
const minOk=await api("/orders",{method:"POST",cookie:U2.cookie,body:order([{id:pBigv.json.product.id,qty:1}],U2.phone,{couponCode:"MIN"})});
console.log("minOrder on 5,000,000 =>", minOk.status, minOk.status===201?"PASS(accepted)":"FAIL", "disc="+minOk.json?.order?.discountAmount);
// --- review daily cap: 11 products, 11 reviews as one user ---
const U3=await mkU(); let last=null, capHit=false;
for(let i=0;i<11;i++){const p=await mkP({name:"p"+i+" "+Date.now(),nameEn:"p"+i,price:100000});
  const r=await api(`/reviews/${p.json.product.id}`,{method:"POST",cookie:U3.cookie,body:{rating:5,name:"کاربر",body:"متن نقد به اندازهٔ کافی بلند است"}});
  last=r.status; if(r.status===429){capHit=true; console.log("review #"+(i+1)+" => 429 (cap hit)"); break;}}
console.log("review daily cap =>", capHit?"PASS(429 on 11th)":"FAIL(last="+last+")");
await mongoose.disconnect();
