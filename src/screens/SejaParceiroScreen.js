import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { parceiroService } from '../services/parceiroService';

const BENEFITS = [
  {
    id: 'admin',
    title: 'Painel do administrador',
    description: 'Atualize horários, fotos e informações a qualquer momento, direto pelos app',
    iconType: 'bars',
  },
  {
    id: 'promos',
    title: 'Promoções exclusivas',
    description: 'Crie ofertas visíveis só para usuários do app e atraia clientes nos horários vazios',
    iconName: 'clock',
  },
  {
    id: 'metrics',
    title: 'Métricas em tempo real',
    description:
      'Veja quantas pessoas visualizaram e clicaram no seu local. Dados reais para decisões reis',
    iconName: 'trending-up',
  },
  {
    id: 'highlight',
    title: 'Destaque na busca',
    description: 'Parceiros aparecem com badge especial e prioridade nas buscas do app',
    iconName: 'user',
  },
];

const FAQS = [
  {
    id: 'cost',
    question: 'Quanto custa para ser parceiro?',
    renderAnswer: () => (
      <Text style={styles.faqAnswerText}>
        <Text style={styles.faqHighlightPurple}>O cadastro é gratuito. </Text>
        Temos planos opcionais com recursos avançados, mas você já pode começar sem pagar nada.
      </Text>
    ),
  },
  {
    id: 'locations',
    question: 'Quantos locais posso cadastrar?',
    renderAnswer: () => (
      <Text style={styles.faqAnswerText}>
        No plano gratuito você pode cadastrar até 2 locais. Com os planos pagos, não há limite.
      </Text>
    ),
  },
  {
    id: 'time',
    question: 'Em quanto tempo meu local aparece no app?',
    renderAnswer: () => (
      <Text style={styles.faqAnswerText}>
        Após a aprovação do cadastro{' '}
        <Text style={styles.faqHighlightPurple}>(até 48h)</Text>
        , seu local entra no ar automaticamente.
      </Text>
    ),
  },
  {
    id: 'remove',
    question: 'Posso remover meu local depois?',
    renderAnswer: () => (
      <Text style={styles.faqAnswerText}>
        <Text style={styles.faqHighlightPurple}>Sim. </Text>
        Você tem controle total e pode pausar ou remover a qualquer momento pelo painel.
      </Text>
    ),
  },
];

export function SejaParceiroScreen({ navigation }) {
  const { user } = useAuth();
  const scrollViewRef = useRef(null);
  const [formY, setFormY] = useState(0);
  const [expandedFaqs, setExpandedFaqs] = useState({});

  const [nome, setNome] = useState(user?.nome || user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [estabelecimento, setEstabelecimento] = useState('');
  const [cidadeEstado, setCidadeEstado] = useState('');
  const [loading, setLoading] = useState(false);

  const handleScrollToForm = () => {
    if (scrollViewRef.current && formY > 0) {
      scrollViewRef.current.scrollTo({ y: formY, animated: true });
    }
  };

  const toggleFaq = (id) => {
    setExpandedFaqs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSubmit = async () => {
    if (!nome.trim() || !email.trim() || !estabelecimento.trim() || !cidadeEstado.trim()) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha todos os campos do formulário.');
      return;
    }

    setLoading(true);
    try {
      await parceiroService.enviarSolicitacaoParceria({
        idUsuario: user?.id_usuario || user?.id || null,
        nome: nome.trim(),
        email: email.trim(),
        estabelecimento: estabelecimento.trim(),
        cidadeEstado: cidadeEstado.trim(),
      });

      Alert.alert(
        'Cadastro enviado!',
        'Recebemos os dados do seu estabelecimento. Nossa equipe entrará em contato em até 48 horas.',
        [
          {
            text: 'OK',
            onPress: () => {
              setEstabelecimento('');
              setCidadeEstado('');
            },
          },
        ]
      );
    } catch (err) {
      console.error('Erro ao enviar solicitação:', err);
      Alert.alert('Erro', err.message || 'Não foi possível enviar o cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => navigation?.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-undo-outline" size={28} color="#C1121F" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation?.navigate('PainelParceiro')}
              activeOpacity={0.7}
            >
              <Text style={styles.alreadyPartnerText}>Já sou parceiro</Text>
            </TouchableOpacity>
          </View>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.programBadge}>{'Programa de parceiros\nABERTO'}</Text>

            <Text style={styles.heroTitle}>
              {'Seu negócio onde\n'}
              <Text style={styles.heroTitlePurple}>{'as pessoas já\nestão '}</Text>
              {'procurando.'}
            </Text>

            <Text style={styles.heroSubtitle}>
              {'Junte-se ao '}
              <Text style={styles.heroSubtitlePurple}>RolêApp</Text>
              {' e coloque\nseu estabelecimento na frente\nde quem busca lugares\nacessíveis perto deles.'}
            </Text>

            <View style={styles.illustrationContainer}>
              <Image
                source={require('../../assets/pig_partner.png')}
                style={styles.heroIllustration}
                resizeMode="contain"
              />
            </View>

            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleScrollToForm}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaButtonText}>Quero me cadastrar grátis</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Red Stats Banner */}
          <View style={styles.statsBanner}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>48H</Text>
              <Text style={styles.statLabel}>para entrar no ar</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>2X</Text>
              <Text style={styles.statLabel}>mais visitas</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>100%</Text>
              <Text style={styles.statLabel}>grátis para começar</Text>
            </View>
          </View>

          {/* Como Funciona Section */}
          <View style={styles.howItWorksSection}>
            <Text style={styles.howItWorksSmallTitle}>Como funciona</Text>
            <Text style={styles.howItWorksTitle}>Três passos para entrar:</Text>

            <View style={styles.stepBlock}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepNumber}>01</Text>
                <Text style={styles.stepTitle}>Cadastre o seu negócio</Text>
              </View>
              <Text style={styles.stepDescription}>
                Preencha um formulário simples com as informações do seu estabelecimento. Leva menos
                de 5 minutos.
              </Text>
            </View>

            <View style={styles.stepBlock}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepNumber}>02</Text>
                <Text style={styles.stepTitle}>Aguarde a análise</Text>
              </View>
              <Text style={styles.stepDescription}>
                Nossa equipe revisa o cadastro em até 48 horas e entra em contato para confirmar a
                parceria.
              </Text>
            </View>

            <View style={styles.stepBlock}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepNumber}>03</Text>
                <Text style={styles.stepTitle}>Comece a atrair clientes</Text>
              </View>
              <Text style={styles.stepDescription}>
                Seu local já aparece no app com destaque. Gerencie tudo pelo painel do parceiro.
              </Text>
            </View>
          </View>

          {/* Seus Benefícios Container */}
          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitsTag}>SEUS BENEFÍCIOS</Text>
            <Text style={styles.benefitsHeading}>{'Tudo que você precisa para\ncrescer'}</Text>

            <View style={styles.benefitsList}>
              {BENEFITS.map((item) => (
                <View key={item.id} style={styles.benefitCard}>
                  <View style={styles.benefitIconBox}>
                    {item.iconType === 'bars' ? (
                      <View style={styles.barsIconContainer}>
                        <View style={[styles.barLine, { width: 6 }]} />
                        <View style={[styles.barLine, { width: 11 }]} />
                        <View style={[styles.barLine, { width: 16 }]} />
                      </View>
                    ) : (
                      <Feather name={item.iconName} size={18} color="#FFFFFF" />
                    )}
                  </View>

                  <View style={styles.benefitTextContent}>
                    <Text style={styles.benefitTitle}>{item.title}</Text>
                    <Text style={styles.benefitDescription}>{item.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Dúvidas Frequentes Section */}
          <View style={styles.faqSection}>
            <Text style={styles.faqTag}>DÚVIDAS FREQUENTES</Text>
            <Text style={styles.faqHeading}>Ficou alguma dúvida?</Text>

            <View style={styles.faqList}>
              {FAQS.map((faq) => {
                const isOpen = !!expandedFaqs[faq.id];
                return (
                  <View key={faq.id} style={styles.faqItem}>
                    <TouchableOpacity
                      style={styles.faqQuestionRow}
                      onPress={() => toggleFaq(faq.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.faqQuestionText}>{faq.question}</Text>
                      <Feather name={isOpen ? 'x' : 'plus'} size={24} color="#000000" />
                    </TouchableOpacity>
                    {isOpen && <View style={styles.faqAnswerContainer}>{faq.renderAnswer()}</View>}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Comece Agora / Form Card */}
          <View
            style={styles.formCard}
            onLayout={(event) => {
              setFormY(event.nativeEvent.layout.y);
            }}
          >
            <Text style={styles.formTag}>COMECE AGORA</Text>
            <Text style={styles.formTitle}>Cadastro gratuito</Text>
            <Text style={styles.formSubtitle}>Nossa equipe entra em contato em até 48 horas.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Seu nome</Text>
              <TextInput
                style={styles.input}
                placeholder="Seu nome aqui"
                placeholderTextColor="#8E8E93"
                value={nome}
                onChangeText={setNome}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>E-mail</Text>
              <TextInput
                style={styles.input}
                placeholder="Seu E-mail aqui"
                placeholderTextColor="#8E8E93"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nome do estabelecimento</Text>
              <TextInput
                style={styles.input}
                placeholder="“Bar do João”"
                placeholderTextColor="#8E8E93"
                value={estabelecimento}
                onChangeText={setEstabelecimento}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Cidade / Estado</Text>
              <TextInput
                style={styles.input}
                placeholder="Brasília, DF"
                placeholderTextColor="#8E8E93"
                value={cidadeEstado}
                onChangeText={setCidadeEstado}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Enviar cadastro</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimerText}>
              Sem spam. Seus dados são usados apenas para contato.
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerLogo}>RolêApp</Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.footerLinkText}>Privacidade</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.footerLinkText}>Termos</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.footerLinkText}>Suporte</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.footerCopyright}>©2026 RolêApp</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAE8F4',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backButton: {
    padding: 4,
  },
  alreadyPartnerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22194D',
  },
  heroSection: {
    marginBottom: 24,
  },
  programBadge: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4C3BA3',
    lineHeight: 24,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 33,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 38,
    marginBottom: 18,
  },
  heroTitlePurple: {
    color: '#4C3BA3',
  },
  heroSubtitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
    marginBottom: 18,
  },
  heroSubtitlePurple: {
    color: '#4C3BA3',
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroIllustration: {
    width: 215,
    height: 125,
  },
  ctaButton: {
    backgroundColor: '#1B1445',
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statsBanner: {
    backgroundColor: '#A31D18',
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 34,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  howItWorksSection: {
    marginBottom: 24,
  },
  howItWorksSmallTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  howItWorksTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 16,
  },
  stepBlock: {
    marginBottom: 22,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  stepNumber: {
    fontSize: 31,
    fontWeight: '800',
    color: '#4C3BA3',
  },
  stepTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#000000',
  },
  stepDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0A0A',
    lineHeight: 20,
    paddingLeft: 10,
  },
  benefitsContainer: {
    backgroundColor: '#C2BBFA',
    borderRadius: 26,
    paddingVertical: 24,
    paddingHorizontal: 14,
    marginBottom: 28,
  },
  benefitsTag: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  benefitsHeading: {
    fontSize: 21,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 25,
    marginBottom: 18,
  },
  benefitsList: {
    gap: 12,
  },
  benefitCard: {
    borderWidth: 1,
    borderColor: 'rgba(76, 59, 163, 0.35)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  benefitIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#C81010',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  barsIconContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 3,
  },
  barLine: {
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  benefitTextContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 3,
  },
  benefitDescription: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A0A0A',
    lineHeight: 16,
  },
  faqSection: {
    marginBottom: 24,
  },
  faqTag: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4C3BA3',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  faqHeading: {
    fontSize: 21,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 18,
  },
  faqList: {
    gap: 16,
  },
  faqItem: {
    paddingVertical: 4,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 21,
  },
  faqAnswerContainer: {
    marginTop: 8,
  },
  faqAnswerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    lineHeight: 20,
  },
  faqHighlightPurple: {
    color: '#4C3BA3',
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: '#F8C7C4',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginBottom: 26,
  },
  formTag: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B91C1C',
    textTransform: 'uppercase',
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#48389A',
    marginTop: 2,
  },
  formSubtitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#000000',
    marginTop: 4,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1E1848',
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
  },
  submitButton: {
    backgroundColor: '#1B1445',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginHorizontal: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  disclaimerText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 4,
  },
  footerLogo: {
    fontSize: 15,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#000000',
    marginBottom: 8,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 8,
  },
  footerLinkText: {
    fontSize: 10.5,
    color: '#1E1E1E',
    fontWeight: '500',
  },
  footerCopyright: {
    fontSize: 8,
    color: '#1E1E1E',
  },
});
