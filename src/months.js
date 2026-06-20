function getTargetMonths(){
    const months=[];
    const today=new Date();
    for(let i = 0; i < 6; i++){
        const date = new Date(
            today.getFullYear(),
            today.getMonth()+i,
            1
        );
        const month = `${date.getFullYear()}${String(date.getMonth() +1).padStart(2,"0")}`;
        months.push(month);
    }
    return months;
}
module.exports=getTargetMonths;