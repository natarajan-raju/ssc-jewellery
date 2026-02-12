import { useEffect, useMemo, useState } from 'react';
import { productService } from '../services/productService';

const dedupeById = (products = []) => {
    const seen = new Set();
    const next = [];
    products.forEach((product) => {
        const id = String(product?.id || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        next.push(product);
    });
    return next;
};

export const useCartRecommendations = ({ items = [], limit = 6 }) => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(false);

    const cartProductIds = useMemo(
        () => new Set(items.map((item) => String(item.productId || item.product_id || ''))),
        [items]
    );

    const categoryNames = useMemo(() => {
        const names = new Set();
        items.forEach((item) => {
            const categories = Array.isArray(item.categories) ? item.categories : [];
            categories.forEach((name) => {
                const normalized = String(name || '').trim();
                if (normalized) names.add(normalized);
            });
        });
        return Array.from(names);
    }, [items]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!items.length || !categoryNames.length) {
                setRecommendations([]);
                return;
            }

            setLoading(true);
            try {
                const targetCategories = categoryNames.slice(0, 3);
                const responses = await Promise.all(
                    targetCategories.map((category) =>
                        productService.getProducts(1, category, 'active', 'newest', 16)
                    )
                );

                const combined = responses.flatMap((res) => (Array.isArray(res?.products) ? res.products : []));
                const unique = dedupeById(combined).filter(
                    (product) => !cartProductIds.has(String(product.id || ''))
                );
                if (!cancelled) {
                    setRecommendations(unique.slice(0, limit));
                }
            } catch {
                if (!cancelled) {
                    setRecommendations([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [cartProductIds, categoryNames, items.length, limit]);

    return { recommendations, loading };
};

