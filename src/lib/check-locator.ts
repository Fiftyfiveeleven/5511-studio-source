// Only disambiguate navigation checks when exactly one matching link belongs to
// a navigation landmark. Other duplicates remain test errors, never first().
export async function checkLocator(page:any,step:{target?:string;action:string},requirement:{id:string;description:string}){
 if(!step.target)return null;
 const locator=page.locator(step.target);
 if(step.action==='click'&&/navigation|navbar|menu/i.test(requirement.id+' '+requirement.description)&&!/footer/i.test(requirement.description)&&await locator.count()>1){
  const navigation=page.getByRole('navigation').locator(step.target);
  if(await navigation.count()===1)return navigation;
 }
 return locator;
}
