// Test Store Setup Script
// Run this with: node setup-test-stores.js

const testStores = [
    {
        storeId: "99348c94-533a-4032-a47b-20236f7c3ec2",
        orgId: "b09f6952-f120-41b6-bbfe-9f6adda0977c",
        name: "Monster Burgers",
        integratorBrandId: "aiburger-brand-001",
        integratorStoreId: "monster-burgers-test",
        merchantStoreId: "99348c94-533a-4032-a47b-20236f7c3ec2"
    },
    {
        storeId: "0ba3d4ee-ab53-4b8f-bbbd-e3529c6b1692",
        orgId: "da3f8201-3423-4d6e-a462-e58a3bb8df8a",
        name: "Bioburger Le Marais",
        integratorBrandId: "aiburger-brand-001",
        integratorStoreId: "bioburger-paris-test",
        merchantStoreId: "0ba3d4ee-ab53-4b8f-bbbd-e3529c6b1692"
    },
    {
        storeId: "88efaf30-3ac0-4641-8d9e-d094ce1a4d72",
        orgId: "81a1607d-292a-45ee-9cae-dd1ba9255e36",
        name: "New York Burger Co",
        integratorBrandId: "aiburger-brand-001",
        integratorStoreId: "ny-burger-test",
        merchantStoreId: "88efaf30-3ac0-4641-8d9e-d094ce1a4d72"
    },
    {
        storeId: "da6ee0ad-886f-4668-b278-9b4dedbceb66",
        orgId: "68d87d4b-6ebf-455e-ac9b-19b0fa45b754",
        name: "Westport Flea Market Bar & Grill",
        integratorBrandId: "aiburger-brand-001",
        integratorStoreId: "westport-test",
        merchantStoreId: "da6ee0ad-886f-4668-b278-9b4dedbceb66"
    },
    {
        storeId: "255b0f1f-2ab4-4992-a7e5-566aeb14be87",
        orgId: "b54e4a5b-12bb-4504-8fcf-dbd4346044d8",
        name: "Wicked Burgers (Kensington)",
        integratorBrandId: "aiburger-brand-001",
        integratorStoreId: "wicked-burgers-test",
        merchantStoreId: "255b0f1f-2ab4-4992-a7e5-566aeb14be87"
    }
];

console.log('Test Store Configuration:');
console.log('========================');
testStores.forEach((store, index) => {
    console.log(`${index + 1}. ${store.name}`);
    console.log(`   Store ID: ${store.storeId}`);
    console.log(`   Brand ID: ${store.integratorBrandId}`);
    console.log(`   Store Ref: ${store.integratorStoreId}`);
    console.log('');
});

console.log('\nTo add these stores, make a POST request to:');
console.log('https://func-burger-api-lf6kch3t2wm3e.azurewebsites.net/api/admin/test-stores');
console.log('\nWith this body (replace YOUR_USER_ID):');
console.log(JSON.stringify({
    userId: "c31ba0dc9389a994ced0ecec9837f611",
    testStores: testStores
}, null, 2));
