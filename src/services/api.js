const base='/api';
export async function api(path,{method='GET',body,token=sessionStorage.getItem('chrono-token')}={}){
 const response=await fetch(`${base}${path}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const payload=response.status===204?null:await response.json().catch(()=>({error:'Unexpected server response'}));
 if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);
 return payload;
}
export const normalize=(x)=>x?({...x,id:x.id||x._id}):x;
