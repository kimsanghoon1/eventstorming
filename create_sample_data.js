/**
 * 샘플 데이터 생성 스크립트
 * CanvasData 분리 구조로 초기 데이터를 생성합니다.
 */

const { getSession, verifyConnection, closeDriver } = require('./src/backend/neo4j');
const { v4: uuidv4 } = require('uuid');

const createSampleData = async () => {
    const connected = await verifyConnection();
    if (!connected) {
        console.error('[Sample] Neo4j connection failed');
        process.exit(1);
    }

    const session = getSession();

    try {
        console.log('[Sample] Creating sample data...');

        // 1. Create BoundedContext
        const contextId = uuidv4();
        await session.run(`
            CREATE (bc:BoundedContext {
                id: $id,
                name: 'Order Management',
                description: '주문 관리 컨텍스트'
            })
        `, { id: contextId });
        console.log('[Sample] ✓ Created BoundedContext: Order Management');

        // 2. Create Board
        const boardId = 'sample-eventstorming.json';
        await session.run(`
            CREATE (b:Board {
                id: $id,
                name: 'Sample Eventstorming',
                boardType: 'Eventstorming',
                path: $id
            })
        `, { id: boardId });
        console.log('[Sample] ✓ Created Board: Sample Eventstorming');

        // 3. Create DomainObjects
        const orderPlacedId = uuidv4();
        await session.run(`
            CREATE (d:DomainObject {
                id: $id,
                type: 'EVENT',
                instanceName: 'OrderPlaced',
                description: '주문이 발생했습니다',
                properties: '{}'
            })
            WITH d
            MATCH (bc:BoundedContext {id: $contextId})
            CREATE (d)-[:BELONGS_TO]->(bc)
        `, { id: orderPlacedId, contextId });
        console.log('[Sample] ✓ Created DomainObject: OrderPlaced');

        const placeOrderId = uuidv4();
        await session.run(`
            CREATE (d:DomainObject {
                id: $id,
                type: 'COMMAND',
                instanceName: 'PlaceOrder',
                description: '주문을 생성합니다',
                properties: '{}'
            })
            WITH d
            MATCH (bc:BoundedContext {id: $contextId})
            CREATE (d)-[:BELONGS_TO]->(bc)
        `, { id: placeOrderId, contextId });
        console.log('[Sample] ✓ Created DomainObject: PlaceOrder');

        const orderAggregateId = uuidv4();
        await session.run(`
            CREATE (d:DomainObject {
                id: $id,
                type: 'AGGREGATE',
                instanceName: 'Order',
                description: '주문 애그리게잇',
                properties: '{}'
            })
            WITH d
            MATCH (bc:BoundedContext {id: $contextId})
            CREATE (d)-[:BELONGS_TO]->(bc)
        `, { id: orderAggregateId, contextId });
        console.log('[Sample] ✓ Created DomainObject: Order');

        // 4. Create relationships
        await session.run(`
            MATCH (cmd:DomainObject {id: $cmdId})
            MATCH (evt:DomainObject {id: $evtId})
            CREATE (cmd)-[:TRIGGERS]->(evt)
        `, { cmdId: placeOrderId, evtId: orderPlacedId });

        await session.run(`
            MATCH (agg:DomainObject {id: $aggId})
            MATCH (cmd:DomainObject {id: $cmdId})
            CREATE (agg)-[:HANDLES]->(cmd)
        `, { aggId: orderAggregateId, cmdId: placeOrderId });

        console.log('[Sample] ✓ Created relationships');

        // 5. Create CanvasItems
        const canvasItems = [
            {
                id: uuidv4(),
                x: 100,
                y: 100,
                width: 120,
                height: 60,
                rotation: 0,
                domainObjectId: placeOrderId
            },
            {
                id: uuidv4(),
                x: 300,
                y: 100,
                width: 120,
                height: 60,
                rotation: 0,
                domainObjectId: orderPlacedId
            },
            {
                id: uuidv4(),
                x: 200,
                y: 250,
                width: 150,
                height: 80,
                rotation: 0,
                domainObjectId: orderAggregateId
            }
        ];

        for (const item of canvasItems) {
            await session.run(`
                CREATE (c:CanvasItem {
                    id: $id,
                    x: $x,
                    y: $y,
                    width: $width,
                    height: $height,
                    rotation: $rotation,
                    boardId: $boardId,
                    domainObjectId: $domainObjectId
                })
                WITH c
                MATCH (b:Board {id: $boardId})
                MATCH (d:DomainObject {id: $domainObjectId})
                CREATE (c)-[:DISPLAYED_ON]->(b)
                CREATE (c)-[:REPRESENTS]->(d)
            `, {
                ...item,
                boardId
            });
        }
        console.log('[Sample] ✓ Created 3 CanvasItems');

        console.log('[Sample] ✅ Sample data created successfully!');
        console.log('[Sample] Board ID:', boardId);

    } catch (error) {
        console.error('[Sample] ❌ Error creating sample data:', error);
        throw error;
    } finally {
        await session.close();
        await closeDriver();
    }
};

createSampleData();
